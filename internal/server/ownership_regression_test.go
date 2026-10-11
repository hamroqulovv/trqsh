package server

import (
	"context"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/trqsh-uz/trqsh/pkg/proto"
)

func TestRegistryLeaseOwnership(t *testing.T) {
	mr := miniredis.RunT(t)
	redis, err := NewRedisRegistry("redis://" + mr.Addr())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = redis.Close() }()
	for _, registry := range []Registry{NewInMemoryRegistry(), redis} {
		ctx := context.Background()
		route := Route{Host: "owner.example.test"}
		a, b := Binding{EdgeID: "a", SessionID: "a"}, Binding{EdgeID: "b", SessionID: "b"}
		if err := registry.Bind(ctx, route, a, time.Minute); err != nil {
			t.Fatal(err)
		}
		if err := registry.Bind(ctx, route, b, time.Minute); err == nil {
			t.Fatal("live route overwritten")
		}
		if err := registry.Refresh(ctx, route, b, time.Hour); err == nil {
			t.Fatal("non-owner refreshed route")
		}
		if err := registry.Unbind(ctx, route, b); err != nil {
			t.Fatal(err)
		}
		if got, ok, _ := registry.Lookup(ctx, route); !ok || got != a {
			t.Fatal("non-owner removed route")
		}
		if err := registry.Unbind(ctx, route, a); err != nil {
			t.Fatal(err)
		}
		if err := registry.Bind(ctx, route, b, time.Minute); err != nil {
			t.Fatal(err)
		}
		if err := registry.Unbind(ctx, route, a); err != nil {
			t.Fatal(err)
		}
		if got, ok, _ := registry.Lookup(ctx, route); !ok || got != b {
			t.Fatal("stale owner removed replacement")
		}
		if err := registry.Refresh(ctx, route, b, time.Minute); err != nil {
			t.Fatal(err)
		}
	}
}

func TestConcurrentTunnelLeasesAcrossEdges(t *testing.T) {
	mr := miniredis.RunT(t)
	a, _ := NewRedisRegistry("redis://" + mr.Addr())
	defer func() { _ = a.Close() }()
	b, _ := NewRedisRegistry("redis://" + mr.Addr())
	defer func() { _ = b.Close() }()
	for _, pair := range [][2]Registry{{NewInMemoryRegistry(), nil}, {a, b}} {
		if pair[1] == nil {
			pair[1] = pair[0]
		}
		var accepted atomic.Int32
		var wg sync.WaitGroup
		for i := range 20 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				id := string(rune('a' + i))
				if pair[i%2].AcquireTunnel(context.Background(), "org", id, 3, time.Minute) == nil {
					accepted.Add(1)
				}
			}()
		}
		wg.Wait()
		if accepted.Load() != 3 {
			t.Fatalf("accepted %d concurrent leases, want 3", accepted.Load())
		}
	}
}

func TestUsageSpoolRestart(t *testing.T) {
	mr := miniredis.RunT(t)
	registry, _ := NewRedisRegistry("redis://" + mr.Addr())
	defer func() { _ = registry.Close() }()
	for _, backend := range []string{"disk", "redis"} {
		t.Run(backend, func(t *testing.T) {
			ent := &auditUsageEnt{fail: true}
			dir := t.TempDir()
			open := func() *usageAgg {
				u := newUsageAgg(ent, time.Second)
				var err error
				if backend == "disk" {
					err = u.enableSpool(dir)
				} else {
					err = u.enableRedisSpool(registry.rdb, "restart-edge")
				}
				if err != nil {
					t.Fatal(err)
				}
				return u
			}
			before := open()
			before.record("org", "tunnel", 123, 0, 1)
			before.flush()
			if len(before.pending) != 1 {
				t.Fatal("failed window discarded")
			}
			id := before.pending[0].EventID
			after := open()
			if len(after.pending) != 1 || after.pending[0].EventID != id {
				t.Fatal("window identity lost across restart")
			}
			ent.fail = false
			after.flush()
			if ent.total != 123 {
				t.Fatalf("recovered usage %d", ent.total)
			}
			if len(open().pending) != 0 {
				t.Fatal("acknowledged batch still persisted")
			}
		})
	}
}

func TestUsageSpoolRejectsSymlinkOutsideDirectory(t *testing.T) {
	dir := t.TempDir()
	spool := filepath.Join(dir, "spool")
	if err := os.Mkdir(spool, 0700); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(dir, "outside.json")
	if err := os.WriteFile(outside, []byte(`{"event_id":"usage_escape","account_id":"org","window_end":"2026-10-11T00:00:00Z"}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(spool, "usage_escape.json")); err != nil {
		if os.IsPermission(err) {
			t.Skipf("symlinks unavailable: %v", err)
		}
		t.Fatal(err)
	}
	u := newUsageAgg(&auditUsageEnt{}, time.Second)
	if err := u.enableSpool(spool); err == nil {
		t.Fatal("usage spool read a symlink outside its directory")
	}
	if len(u.pending) != 0 {
		t.Fatal("usage from outside the spool was queued")
	}
}

func TestPortAllocationSkipsOtherEdge(t *testing.T) {
	mr := miniredis.RunT(t)
	rr, err := NewRedisRegistry("redis://" + mr.Addr())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = rr.Close() }()
	for _, registry := range []Registry{NewInMemoryRegistry(), rr} {
		for _, kind := range []proto.TunnelType{proto.TunnelType_TCP, proto.TunnelType_UDP} {
			t.Run(fmt.Sprintf("%T/%s", registry, kind), func(t *testing.T) {
				first := freePortPair(t)
				s, a := auditServer(t)
				s.ports = newPortManager(first, first+1)
				s.reg = registry
				t.Cleanup(func() { s.teardownSession(context.Background(), a); s.ports.closeAll(); s.wg.Wait() })
				typ := protoForType(kind)
				route := Route{Proto: typ, Port: first}
				other := Binding{EdgeID: "other-edge", SessionID: "other-session"}
				if err := registry.Bind(context.Background(), route, other, time.Minute); err != nil {
					t.Fatal(err)
				}
				t.Cleanup(func() { _ = registry.Unbind(context.Background(), route, other) })
				exact := s.handleBind(context.Background(), a, &proto.BindTunnel{ClientTunnelId: "exact", Type: kind, RemotePort: uint32(first)})
				if exact.Ok {
					t.Fatal("explicit port replaced other edge's binding")
				}
				result := s.handleBind(context.Background(), a, &proto.BindTunnel{ClientTunnelId: "auto", Type: kind})
				if !result.Ok || result.AssignedPort != uint32(first+1) {
					t.Fatalf("allocation: %v", result)
				}
				if got, ok, err := registry.Lookup(context.Background(), route); err != nil || !ok || got != other {
					t.Fatalf("other edge's route changed: %v %v %v", got, ok, err)
				}
			})
		}
	}
}

// Check both protocols since the allocation test exercises TCP and UDP.
func freePortPair(t *testing.T) int {
	t.Helper()
	for range 30 {
		ln, err := net.Listen("tcp", ":0")
		if err != nil {
			t.Fatal(err)
		}
		port := ln.Addr().(*net.TCPAddr).Port
		if err := ln.Close(); err != nil {
			t.Fatal(err)
		}
		if port >= 65535 {
			continue
		}
		available := true
		for _, candidate := range []int{port, port + 1} {
			ln, err := net.Listen("tcp", fmt.Sprintf(":%d", candidate))
			if err != nil {
				available = false
				break
			}
			if err := ln.Close(); err != nil {
				t.Fatal(err)
			}
			uc, err := net.ListenUDP("udp", &net.UDPAddr{Port: candidate})
			if err != nil {
				available = false
				break
			}
			if err := uc.Close(); err != nil {
				t.Fatal(err)
			}
		}
		if available {
			return port
		}
	}
	t.Fatal("no adjacent free test ports")
	return 0
}

func TestDuplicateCustomHostPreservesOriginalLease(t *testing.T) {
	s, a := auditServer(t)
	s.ent = auditEnt{max: 3}
	defer s.teardownSession(context.Background(), a)
	first := s.handleBind(context.Background(), a, &proto.BindTunnel{ClientTunnelId: "first", CustomDomain: "customer.test"})
	if !first.Ok {
		t.Fatal(first)
	}
	second := s.handleBind(context.Background(), a, &proto.BindTunnel{ClientTunnelId: "second", CustomDomain: "customer.test"})
	if second.Ok {
		t.Fatal("duplicate host accepted")
	}
	if _, ok, err := s.reg.Lookup(context.Background(), Route{Host: "customer.test"}); err != nil || !ok {
		t.Fatalf("original lease lost: %v", err)
	}
}

func TestUsageSnapshotPersistedBeforeDelivery(t *testing.T) {
	mr := miniredis.RunT(t)
	rr, err := NewRedisRegistry("redis://" + mr.Addr())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = rr.Close() }()
	for _, backend := range []string{"disk", "redis"} {
		t.Run(backend, func(t *testing.T) {
			dir := t.TempDir()
			e := &auditUsageEnt{fail: true}
			u := newUsageAgg(e, time.Second)
			var err error
			if backend == "disk" {
				err = u.enableSpool(dir)
			} else {
				err = u.enableRedisSpool(rr.rdb, "snapshot-edge")
			}
			if err != nil {
				t.Fatal(err)
			}
			first := true
			e.before = func() {
				if !first {
					return
				}
				first = false
				count := len(mr.Keys())
				if backend == "disk" {
					entries, err := os.ReadDir(dir)
					if err != nil {
						t.Fatal(err)
					}
					count = len(entries)
				}
				if count != 3 {
					t.Fatalf("only %d/3 batches persisted before first delivery", count)
				}
			}
			for i := range 3 {
				u.record("org", fmt.Sprint(i), 100, 0, 1)
			}
			u.flush()
			if first || len(u.pending) != 3 {
				t.Fatal("delivery failure did not retain complete snapshot")
			}
		})
	}
}

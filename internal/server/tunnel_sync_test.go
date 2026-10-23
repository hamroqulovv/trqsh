package server

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/trqsh-uz/trqsh/internal/entitlerpc"
	"github.com/trqsh-uz/trqsh/pkg/proto"
)

// syncRecorder is a tunnelReporter that records syncs and holds every close
// event until hold is closed.
type syncRecorder struct {
	hold  chan struct{}
	mu    sync.Mutex
	syncs []entitlerpc.TunnelSync
}

func (r *syncRecorder) ReportTunnel(_ context.Context, tr entitlerpc.TunnelReport) error {
	if tr.Action == "close" && r.hold != nil {
		<-r.hold
	}
	return nil
}

func (r *syncRecorder) SyncTunnels(_ context.Context, ts entitlerpc.TunnelSync) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.syncs = append(r.syncs, ts)
	return nil
}

func (r *syncRecorder) count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.syncs)
}

// liveAfterSync runs one sync and returns its live set as "session/tunnel".
func liveAfterSync(t *testing.T, s *Server, r *syncRecorder) []string {
	t.Helper()
	s.syncTunnels(context.Background())
	r.mu.Lock()
	defer r.mu.Unlock()
	last := r.syncs[len(r.syncs)-1]
	if last.EdgeID != s.cfg.EdgeID || last.At.IsZero() {
		t.Fatalf("sync = %+v, want this edge's ID and a snapshot time", last)
	}
	live := []string{}
	for _, ref := range last.Live {
		live = append(live, ref.SessionID+"/"+ref.TunnelID)
	}
	return live
}

func TestTunnelSyncCountsClosingTunnelsAsLive(t *testing.T) {
	s, a := auditServer(t)
	rec := &syncRecorder{hold: make(chan struct{})}
	s.reporter = rec
	if live := liveAfterSync(t, s, rec); len(live) != 0 {
		t.Fatalf("live before any bind = %v", live)
	}
	if r := s.handleBind(context.Background(), a, &proto.BindTunnel{ClientTunnelId: "t1", Subdomain: "synced"}); !r.Ok {
		t.Fatalf("bind: %+v", r)
	}
	if live := liveAfterSync(t, s, rec); len(live) != 1 || live[0] != "audit/t1" {
		t.Fatalf("live after bind = %v, want [audit/t1]", live)
	}
	// Released, but its close event is not delivered yet: a sync that dropped it
	// now would close the history row first, and the event's totals would be lost.
	s.handleUnbind(context.Background(), a, "t1")
	if live := liveAfterSync(t, s, rec); len(live) != 1 || live[0] != "audit/t1" {
		t.Fatalf("live while the close event is pending = %v, want [audit/t1]", live)
	}
	close(rec.hold)
	for deadline := time.Now().Add(5 * time.Second); ; time.Sleep(10 * time.Millisecond) {
		live := liveAfterSync(t, s, rec)
		if len(live) == 0 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("live after the close event = %v, want none", live)
		}
	}
}

func TestTunnelSyncRunsAtStartupAndStopsWithTheEdge(t *testing.T) {
	s, _ := auditServer(t)
	rec := &syncRecorder{}
	s.reporter = rec
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { s.runTunnelSync(ctx); close(done) }()
	// The first sync must not wait for the interval: it is what closes the rows a
	// previous run of this edge left active.
	for deadline := time.Now().Add(5 * time.Second); rec.count() == 0; time.Sleep(10 * time.Millisecond) {
		if time.Now().After(deadline) {
			t.Fatal("no tunnel sync at startup")
		}
	}
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("tunnel sync loop did not stop with the edge")
	}
}

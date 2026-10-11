package server

import (
	"bufio"
	"context"
	"fmt"
	"github.com/trqsh-uz/trqsh/pkg/authz"
	"github.com/trqsh-uz/trqsh/pkg/proto"
	"github.com/trqsh-uz/trqsh/pkg/tunnel"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type auditStream struct{ net.Conn }

func (*auditStream) ID() uint64 { return 1 }

type auditSession struct {
	seen     chan *http.Request
	response string
}

func (s *auditSession) OpenStream(context.Context) (tunnel.Stream, error) {
	a, b := net.Pipe()
	go func() {
		defer b.Close()
		_, err := proto.ReadStreamInit(b)
		if err != nil {
			return
		}
		r, err := http.ReadRequest(bufio.NewReader(b))
		if err != nil {
			return
		}
		io.Copy(io.Discard, r.Body)
		r.Body.Close()
		if s.seen != nil {
			s.seen <- r
		}
		io.WriteString(b, s.response)
	}()
	return &auditStream{a}, nil
}
func (*auditSession) AcceptStream(context.Context) (tunnel.Stream, error) { return nil, io.EOF }
func (*auditSession) Kind() tunnel.Kind                                   { return tunnel.KindTCP }
func (*auditSession) RemoteAddr() net.Addr                                { return &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 1} }
func (*auditSession) CloseWithError(uint32, string) error                 { return nil }
func (*auditSession) Context() context.Context                            { return context.Background() }

type auditEnt struct {
	authz.StubEntitlements
	max int32
}

func (e auditEnt) CheckBind(ctx context.Context, r authz.BindRequest) (authz.Decision, error) {
	d, _ := (authz.StubEntitlements{}).CheckBind(ctx, r)
	d.Limits.MaxConcurrentTunnels = int(e.max)
	if e.max == 0 {
		d.Limits.MaxConcurrentTunnels = 1
	}
	return d, nil
}
func auditServer(t *testing.T) (*Server, *agentSession) {
	t.Helper()
	cfg := DefaultConfig()
	cfg.BaseDomain = "example.test"
	cfg.APIUpstream = "http://127.0.0.1:1"
	s, err := New(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	s.ent = auditEnt{}
	a := &agentSession{sessionID: "audit", accountID: "dev", apiKey: "audit", tunnels: map[string]*boundTunnel{}, sess: &auditSession{response: "HTTP/1.1 200 OK\r\nContent-Length: 6\r\n\r\ntenant"}}
	return s, a
}
func TestAuditConcurrentTunnelLimit(t *testing.T) {
	s, a := auditServer(t)
	for i := 0; i < 2; i++ {
		r := s.handleBind(context.Background(), a, &proto.BindTunnel{ClientTunnelId: fmt.Sprint(i), Subdomain: fmt.Sprintf("quota%d", i)})
		if i == 1 && r.Ok {
			t.Error("second tunnel allowed although MaxConcurrentTunnels=1")
		}
	}
}
func TestAuditReservedHostRouting(t *testing.T) {
	s, a := auditServer(t)
	r := s.handleBind(context.Background(), a, &proto.BindTunnel{ClientTunnelId: "1", Subdomain: "api"})
	if r.Ok {
		t.Fatal("platform hostname bind accepted")
	}
	// A legacy reservation must also lose to the configured platform upstream.
	if err := s.hub.bindHost(&boundTunnel{host: "api.example.test", session: a, clientTunnelID: "legacy"}); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	s.routeHTTPS(w, httptest.NewRequest("GET", "https://api.example.test/", nil))
	if w.Body.String() == "tenant" {
		t.Error("platform API hostname served tenant content instead of configured API upstream")
	}
}
func TestAuditH2ForwardedHeaders(t *testing.T) {
	s, a := auditServer(t)
	seen := make(chan *http.Request, 1)
	a.sess = &auditSession{seen: seen, response: "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok"}
	s.handleBind(context.Background(), a, &proto.BindTunnel{ClientTunnelId: "1", Subdomain: "headers"})
	r := httptest.NewRequest("GET", "https://headers.example.test/", nil)
	r.RemoteAddr = "203.0.113.5:40000"
	r.Header.Set("X-Forwarded-For", "127.0.0.1")
	r.Header.Set("X-Real-IP", "127.0.0.1")
	r.Header.Set("Forwarded", "for=127.0.0.1")
	s.routeHTTPS(httptest.NewRecorder(), r)
	got := <-seen
	if got.Header.Get("X-Forwarded-For") != "203.0.113.5" || got.Header.Get("Forwarded") != "" {
		t.Errorf("spoofed client IP headers reached agent: %v", got.Header)
	}
}
func TestAuditChunkedHTTPUsage(t *testing.T) {
	s, a := auditServer(t)
	a.sess = &auditSession{response: "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n5\r\nhello\r\n0\r\n\r\n"}
	s.handleBind(context.Background(), a, &proto.BindTunnel{ClientTunnelId: "1", Subdomain: "chunks"})
	c, d := tcpConnPair(t)
	defer c.Close()
	c.SetDeadline(time.Now().Add(3 * time.Second))
	done := make(chan struct{})
	go func() { defer close(done); s.serveHTTPConn(d, "https") }()
	io.WriteString(c, "GET / HTTP/1.1\r\nHost: chunks.example.test\r\nConnection: close\r\n\r\n")
	resp, err := http.ReadResponse(bufio.NewReader(c), nil)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	<-done
	if string(body) != "hello" {
		t.Fatalf("body %q", body)
	}
	bt := s.hub.LookupHost("chunks.example.test")
	if n := bt.bytesOut.Load(); n != 5 {
		t.Errorf("delivered 5 bytes but usage records %d", n)
	}
}
func TestAuditDuplicateClientTunnelID(t *testing.T) {
	s, a := auditServer(t)
	s.ent = auditEnt{max: 3}
	for i, host := range []string{"first", "second"} {
		r := s.handleBind(context.Background(), a, &proto.BindTunnel{ClientTunnelId: "same", Subdomain: host})
		if (i == 0) != r.Ok {
			t.Fatalf("bind %d: %v", i, r)
		}
	}
	s.teardownSession(context.Background(), a)
	if bt := s.hub.LookupHost("first.example.test"); bt != nil {
		t.Error("duplicate client ID left orphan host route after session teardown")
	}
}
func TestAuditRegistryOwnership(t *testing.T) {
	ctx := context.Background()
	r := NewInMemoryRegistry()
	route := Route{Host: "shared.example.test"}
	a := Binding{EdgeID: "edge-a", SessionID: "a"}
	b := Binding{EdgeID: "edge-b", SessionID: "b"}
	if err := r.Bind(ctx, route, a, time.Minute); err != nil {
		t.Fatal(err)
	}
	if err := r.Bind(ctx, route, b, time.Minute); err == nil {
		t.Fatal("live route overwritten")
	}
	r.Unbind(ctx, route, b)
	got, ok, err := r.Lookup(ctx, route)
	if err != nil || !ok || got != a {
		t.Fatal("non-owner unbind removed route")
	}
}

type auditUsageEnt struct {
	authz.StubEntitlements
	fail   bool
	total  int64
	before func()
}

func (e *auditUsageEnt) ReportUsage(_ context.Context, u authz.Usage) error {
	if e.before != nil {
		e.before()
	}
	if e.fail {
		return fmt.Errorf("temporary API outage")
	}
	e.total += u.BytesIn
	return nil
}
func TestAuditUsageRetry(t *testing.T) {
	e := &auditUsageEnt{fail: true}
	u := newUsageAgg(e, time.Second)
	u.record("org", "tunnel", 100, 0, 1)
	u.flush()
	e.fail = false
	u.flush()
	if e.total != 100 {
		t.Errorf("recovered API received %d bytes, want 100; failed usage window was discarded", e.total)
	}
}

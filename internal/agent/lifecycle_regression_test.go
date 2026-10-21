package agent

import (
	"context"
	"github.com/trqsh-uz/trqsh/pkg/proto"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type auditControlStream struct{ net.Conn }

func (*auditControlStream) ID() uint64 { return 1 }
func TestAuditReconnectPreservesUnreservedSpec(t *testing.T) {
	for _, tc := range []struct {
		name string
		spec TunnelSpec
		host string
		port int
	}{
		{"random-http", TunnelSpec{Proto: "http", Addr: "3000"}, "random123.example.test", 0},
		{"tcp", TunnelSpec{Proto: "tcp", Addr: "3000"}, "example.test", 20000},
		{"custom", TunnelSpec{Proto: "https", Addr: "3000", CustomDomain: "app.customer.test"}, "app.customer.test", 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			a := New(DefaultConfig(), nil)
			defer func() { _ = a.Shutdown(context.Background()) }()
			c, d := net.Pipe()
			defer func() { _ = c.Close() }()
			defer func() { _ = d.Close() }()
			if err := c.SetDeadline(time.Now().Add(3 * time.Second)); err != nil {
				t.Fatal(err)
			}
			if err := d.SetDeadline(time.Now().Add(3 * time.Second)); err != nil {
				t.Fatal(err)
			}
			a.control = &auditControlStream{c}
			old := &activeTunnel{spec: tc.spec, clientTunnelID: "old", assignedHost: tc.host, assignedPort: tc.port}
			a.tunnels["old"] = old
			seen := make(chan *proto.BindTunnel, 1)
			go func() {
				e, err := proto.ReadMsg(d)
				if err != nil {
					return
				}
				b := e.GetBind()
				seen <- b
				a.deliverBind(&proto.BindResp{ClientTunnelId: b.ClientTunnelId, Ok: false, Error: proto.NewError(proto.CodeSubdomainForbidden, "not reserved")})
			}()
			a.rebindAll([]*activeTunnel{old})
			b := <-seen
			if b.Subdomain != "" {
				t.Errorf("reconnect added unreserved subdomain %q; real API will reject it", b.Subdomain)
			}
		})
	}
}
func TestAuditLogoutClearsAgentCredentials(t *testing.T) {
	t.Setenv("TRQSH_CONFIG", t.TempDir()+"/config.yml")
	t.Setenv("TRQSH_API_KEY", "")
	cfg := DefaultConfig()
	cfg.APIKey = "audit-key"
	if err := cfg.Save(DefaultConfigPath()); err != nil {
		t.Fatal(err)
	}
	a := New(cfg, nil)
	defer func() { _ = a.Shutdown(context.Background()) }()
	l := NewLocalAPI(a)
	w := httptest.NewRecorder()
	l.Handler().ServeHTTP(w, httptest.NewRequest("POST", "http://127.0.0.1/logout", nil))
	if a.cfg.APIKey != "" {
		t.Errorf("logout returned %d but agent still retains API key %q", w.Code, a.cfg.APIKey)
	}
	if w.Code != 204 || a.Status().Connected || len(a.List()) != 0 || storedAPIKey() != "" {
		t.Fatal("logout did not clear persisted and live state")
	}
	if err := a.ensureConnected(context.Background()); err == nil {
		t.Fatal("logged-out agent connected with development fallback credentials")
	}
}

// /login with a key the control plane rejects must fail there, not later as a
// closed edge session, and must not replace the stored key.
func TestLoginRejectsInvalidAPIKey(t *testing.T) {
	t.Setenv("TRQSH_CONFIG", t.TempDir()+"/config.yml")
	t.Setenv("TRQSH_API_KEY", "")
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/account" {
			t.Errorf("unexpected request %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") == "Bearer good-key" {
			apiWriteJSON(w, http.StatusOK, map[string]string{"id": "user_1"})
			return
		}
		apiWriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid api key"})
	}))
	defer upstream.Close()
	cfg := DefaultConfig()
	cfg.APIBase = upstream.URL
	cfg.APIKey = "old-key"
	if err := cfg.Save(DefaultConfigPath()); err != nil {
		t.Fatal(err)
	}
	a := New(cfg, nil)
	defer func() { _ = a.Shutdown(context.Background()) }()
	h := NewLocalAPI(a).Handler()

	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("POST", "http://127.0.0.1/login", strings.NewReader(`{"token":"bad-key"}`)))
	if w.Code != http.StatusUnauthorized || !strings.Contains(w.Body.String(), "invalid API key") {
		t.Fatalf("bad key: HTTP %d %s", w.Code, w.Body.String())
	}
	if storedAPIKey() != "old-key" {
		t.Fatalf("rejected key replaced the stored key: %q", storedAPIKey())
	}

	w = httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("POST", "http://127.0.0.1/login", strings.NewReader(`{"token":"good-key"}`)))
	if w.Code/100 != 2 || storedAPIKey() != "good-key" {
		t.Fatalf("good key: HTTP %d %s, stored %q", w.Code, w.Body.String(), storedAPIKey())
	}
}

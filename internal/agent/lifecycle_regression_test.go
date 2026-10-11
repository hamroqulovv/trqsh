package agent

import (
	"context"
	"github.com/trqsh-uz/trqsh/pkg/proto"
	"net"
	"net/http/httptest"
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
			defer a.Shutdown(context.Background())
			c, d := net.Pipe()
			defer c.Close()
			defer d.Close()
			c.SetDeadline(time.Now().Add(3 * time.Second))
			d.SetDeadline(time.Now().Add(3 * time.Second))
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
	defer a.Shutdown(context.Background())
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

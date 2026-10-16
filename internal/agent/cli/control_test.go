package cli

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/trqsh-uz/trqsh/internal/agent"
)

func TestReuseDaemonAfterUpgrade(t *testing.T) {
	t.Setenv("TRQSH_CONFIG", filepath.Join(t.TempDir(), "trqsh.yml"))
	if err := os.WriteFile(agent.ControlTokenPath(), []byte("test-local-token"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, version                      string
		managed                            *bool
		badSession, denyAuth, denyShutdown bool
		wantReuse, wantShutdown, wantError bool
	}{
		{name: "same", version: "0.2.5", wantReuse: true},
		{name: "newer", version: "0.2.10", wantReuse: true},
		{name: "older", version: "0.2.4", wantShutdown: true},
		{name: "legacy-without-version", wantShutdown: true},
		{name: "desktop-owned", version: "0.2.4", managed: boolPtr(false), wantError: true},
		{name: "unrecognized-service", badSession: true, wantError: true},
		{name: "unauthorized", denyAuth: true, wantError: true},
		{name: "shutdown-failed", version: "0.2.4", denyShutdown: true, wantShutdown: true, wantError: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var stopped atomic.Bool
			var shutdowns atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/healthz" {
					if stopped.Load() {
						w.WriteHeader(http.StatusServiceUnavailable)
					}
					return
				}
				if r.Header.Get("Authorization") != "Bearer test-local-token" || tc.denyAuth {
					w.WriteHeader(http.StatusUnauthorized)
					return
				}
				switch r.URL.Path {
				case "/session":
					if tc.badSession {
						_, _ = w.Write([]byte(`{"other":true}`))
						return
					}
					session := map[string]any{"authed": false, "status": agent.Status{}}
					if tc.version != "" {
						session["version"] = tc.version
					}
					if tc.managed != nil {
						session["managed"] = *tc.managed
					}
					_ = json.NewEncoder(w).Encode(session)
				case "/shutdown":
					shutdowns.Add(1)
					if tc.denyShutdown {
						w.WriteHeader(http.StatusForbidden)
						return
					}
					stopped.Store(true)
					w.WriteHeader(http.StatusNoContent)
				default:
					w.WriteHeader(http.StatusNotFound)
				}
			}))
			defer server.Close()
			reuse, err := reuseDaemon(strings.TrimPrefix(server.URL, "http://"), "0.2.5")
			if reuse != tc.wantReuse || (err != nil) != tc.wantError || (shutdowns.Load() != 0) != tc.wantShutdown {
				t.Fatalf("reuse=%v, err=%v, shutdowns=%d", reuse, err, shutdowns.Load())
			}
		})
	}
}

func boolPtr(v bool) *bool { return &v }

func TestBaseDomainOfWebSocketServer(t *testing.T) {
	for _, tc := range []struct{ server, want string }{
		{"wss://tunnel.trqsh.uz/_trqsh/agent", "tunnel.trqsh.uz"},
		{"ws://localhost:4445/_trqsh/agent", "localhost"},
		{"edge.example:4443", "edge.example"},
		{"[::1]:4443", "::1"},
	} {
		if got := baseDomainOf(agent.Config{Server: tc.server}); got != tc.want {
			t.Errorf("%q: got %q, want %q", tc.server, got, tc.want)
		}
	}
}

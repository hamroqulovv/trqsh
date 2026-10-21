package server_test

import (
	"context"
	"crypto/tls"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/trqsh-uz/trqsh/internal/server"
)

func startPassthroughEdge(t *testing.T, spec string) *server.Server {
	t.Helper()
	routes, err := server.ParsePassthrough(spec)
	if err != nil {
		t.Fatalf("ParsePassthrough: %v", err)
	}
	cfg := server.DefaultConfig()
	cfg.BaseDomain = "lvh.me"
	cfg.QUICAddr = "127.0.0.1:0"
	cfg.TCPAddr = "127.0.0.1:0"
	cfg.HTTPAddr = "127.0.0.1:0"
	cfg.HTTPSAddr = "127.0.0.1:0"
	cfg.MetricsAddr = "127.0.0.1:0"
	cfg.HeartbeatInterval = 0
	cfg.Passthrough = routes
	srv, err := server.New(cfg, testLogger())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go func() { _ = srv.Run(ctx) }()
	select {
	case <-srv.Ready():
	case <-time.After(5 * time.Second):
		t.Fatal("edge did not become ready")
	}
	return srv
}

func httpsGet(t *testing.T, edge net.Addr, sni string) (*http.Response, string) {
	t.Helper()
	client := &http.Client{
		Timeout: 5 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true, ServerName: sni},
			DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
				return (&net.Dialer{}).DialContext(ctx, network, edge.String())
			},
		},
	}
	resp, err := client.Get("https://" + sni + "/")
	if err != nil {
		t.Fatalf("GET %s: %v", sni, err)
	}
	defer func() { _ = resp.Body.Close() }()
	b, _ := io.ReadAll(resp.Body)
	return resp, string(b)
}

func TestTLSPassthroughSplicesToBackend(t *testing.T) {
	backend := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "backend:"+r.Host)
	}))
	t.Cleanup(backend.Close)
	addr := strings.TrimPrefix(backend.URL, "https://")
	srv := startPassthroughEdge(t, "shop.example.com="+addr)

	resp, body := httpsGet(t, srv.HTTPSAddr(), "shop.example.com")
	if body != "backend:shop.example.com" {
		t.Fatalf("passthrough body = %q", body)
	}
	// The certificate is the backend's own, not one the edge issued.
	if got := resp.TLS.PeerCertificates[0]; !got.Equal(backend.Certificate()) {
		t.Fatalf("passthrough served the edge certificate, want the backend's")
	}

	// Other names still terminate at the edge.
	resp, _ = httpsGet(t, srv.HTTPSAddr(), "nobody.lvh.me")
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("edge-routed status = %d, want 404", resp.StatusCode)
	}
}

func TestTLSPassthroughAllowList(t *testing.T) {
	backend := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, "ok")
	}))
	t.Cleanup(backend.Close)
	addr := strings.TrimPrefix(backend.URL, "https://")
	srv := startPassthroughEdge(t, "shop.example.com="+addr+"?allow=cloudflare")

	c, err := tls.Dial("tcp", srv.HTTPSAddr().String(), &tls.Config{InsecureSkipVerify: true, ServerName: "shop.example.com"})
	if err == nil {
		_ = c.Close()
		t.Fatal("loopback client reached a Cloudflare-only backend")
	}
}

func TestTLSPassthroughProxyProtocol(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	header := make(chan string, 1)
	go func() {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		defer func() { _ = c.Close() }()
		buf := make([]byte, 128)
		n, _ := c.Read(buf)
		header <- string(buf[:n])
	}()
	srv := startPassthroughEdge(t, "shop.example.com="+ln.Addr().String()+"?proxy=v1")

	c, err := net.Dial("tcp", srv.HTTPSAddr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = c.Close() }()
	go func() {
		_ = tls.Client(c, &tls.Config{InsecureSkipVerify: true, ServerName: "shop.example.com"}).Handshake()
	}()
	select {
	case h := <-header:
		if !strings.HasPrefix(h, "PROXY TCP4 127.0.0.1 127.0.0.1 ") {
			t.Fatalf("backend first bytes = %q, want a PROXY v1 header", h)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("backend never received the connection")
	}
}

func TestTLSPassthroughPlainHTTPRedirects(t *testing.T) {
	srv := startPassthroughEdge(t, "shop.example.com=127.0.0.1:1")
	client := &http.Client{
		Timeout:       5 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	req, _ := http.NewRequest(http.MethodGet, "http://"+srv.HTTPAddr().String()+"/pay?x=1", nil)
	req.Host = "shop.example.com"
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	if loc := resp.Header.Get("Location"); loc != "https://shop.example.com/pay?x=1" {
		t.Fatalf("Location = %q", loc)
	}
}

func TestParsePassthrough(t *testing.T) {
	routes, err := server.ParsePassthrough("A.example.com.=a:443?allow=10.0.0.1,192.168.0.0/16&proxy=v1  b.example.com=b:8443")
	if err != nil {
		t.Fatal(err)
	}
	a := routes["a.example.com"]
	if a.Backend != "a:443" || !a.ProxyProtocol || len(a.Allow) != 2 {
		t.Fatalf("a = %+v", a)
	}
	if routes["b.example.com"].Backend != "b:8443" {
		t.Fatalf("b = %+v", routes["b.example.com"])
	}
	for _, bad := range []string{"a.example.com", "a.example.com=noport", "a.example.com=a:1?allow=nope", "a.example.com=a:1?proxy=v2", "x=a:1 x=b:1"} {
		if _, err := server.ParsePassthrough(bad); err == nil {
			t.Errorf("ParsePassthrough(%q) accepted", bad)
		}
	}
}

func TestLoadConfigPassthroughRequiresReservation(t *testing.T) {
	t.Setenv("TRQSH_BASE_DOMAIN", "trqsh.uz")
	t.Setenv("TRQSH_TLS_PASSTHROUGH", "api.trqsh.uz=x:443")
	if _, err := server.LoadConfig(); err == nil || !strings.Contains(err.Error(), "control-plane") {
		t.Fatalf("control-plane passthrough err = %v", err)
	}
	t.Setenv("TRQSH_TLS_PASSTHROUGH", "stars.trqsh.uz=x:443")
	if _, err := server.LoadConfig(); err == nil || !strings.Contains(err.Error(), "TRQSH_RESERVED_SUBDOMAINS") {
		t.Fatalf("unreserved passthrough err = %v", err)
	}
	t.Setenv("TRQSH_TLS_PASSTHROUGH", "stars.example.com=x:443")
	if _, err := server.LoadConfig(); err != nil {
		t.Fatalf("off-zone passthrough: %v", err)
	}
}

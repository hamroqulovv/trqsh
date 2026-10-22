package portscan

import (
	"context"
	"crypto/tls"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"slices"
	"testing"
	"time"
)

func portOf(t *testing.T, addr net.Addr) int {
	t.Helper()
	return addr.(*net.TCPAddr).Port
}

func loopback() netip.Addr { return netip.AddrFrom4([4]byte{127, 0, 0, 1}) }

func probeServer(t *testing.T, h http.Handler) Service {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	s := Service{Port: portOf(t, srv.Listener.Addr()), ip: loopback(), Process: "node"}
	classify(&s)
	probe(context.Background(), &s)
	return s
}

func TestProbeFingerprints(t *testing.T) {
	cases := []struct {
		name     string
		handler  http.HandlerFunc
		app      string
		kind     Kind
		title    string
		detailIn string
	}{
		{"vite", func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte(`<!doctype html><html><head><script type="module" src="/@vite/client"></script><title>My  App &amp; Co</title></head><body></body></html>`))
		}, "Vite", KindWeb, "My App & Co", ""},
		{"next", func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("X-Powered-By", "Next.js")
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(`<html><head><title>Dash</title></head></html>`))
		}, "Next.js", KindWeb, "Dash", ""},
		{"flask json", func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Server", "Werkzeug/3.0 Python/3.12")
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"ok":true}`))
		}, "Flask", KindAPI, "", "JSON"},
		{"express api 404", func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("X-Powered-By", "Express")
			http.Error(w, "Cannot GET /", http.StatusNotFound)
		}, "Express", KindHTTP, "", "404"},
		{"plain node", func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte("hello"))
		}, "Node.js", KindHTTP, "", ""},
		{"redirect to login", func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/" {
				http.Redirect(w, r, "/login", http.StatusFound)
				return
			}
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte(`<title>Grafana</title>`))
		}, "Grafana", KindWeb, "Grafana", "→ /login"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := probeServer(t, tc.handler)
			if s.App != tc.app || s.Kind != tc.kind || s.Title != tc.title {
				t.Fatalf("got app=%q kind=%q title=%q, want %q %q %q", s.App, s.Kind, s.Title, tc.app, tc.kind, tc.title)
			}
			if s.Detail != tc.detailIn {
				t.Fatalf("detail = %q, want %q", s.Detail, tc.detailIn)
			}
			if s.Scheme != "http" {
				t.Fatalf("scheme = %q", s.Scheme)
			}
		})
	}
}

func TestProbeTLS(t *testing.T) {
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<title>secure</title>`))
	}))
	srv.TLS = &tls.Config{}
	srv.StartTLS()
	defer srv.Close()
	s := Service{Port: portOf(t, srv.Listener.Addr()), ip: loopback()}
	classify(&s)
	probe(context.Background(), &s)
	if s.Scheme != "https" || s.Kind != KindWeb || s.Title != "secure" {
		t.Fatalf("got %+v", s)
	}
}

func TestProbeNonHTTP(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = ln.Close() }()
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			_, _ = c.Write([]byte("SSH-2.0-test\r\n"))
			// Like a real daemon, read what the client sends before hanging up;
			// closing with unread data would reset the connection mid-banner.
			_ = c.SetReadDeadline(time.Now().Add(time.Second))
			_, _ = c.Read(make([]byte, 512))
			_ = c.Close()
		}
	}()
	s := Service{Port: portOf(t, ln.Addr()), ip: loopback()}
	classify(&s)
	probe(context.Background(), &s)
	if s.Kind != KindTCP || s.Detail != "SSH-2.0-test" {
		t.Fatalf("got %+v", s)
	}
}

func TestClassifyNeverProbesKnownServices(t *testing.T) {
	for _, s := range []Service{{Port: 5432}, {Port: 8080, Process: "postgres"}, {Port: 3000, Process: "svchost"}} {
		if !classify(&s) {
			t.Errorf("%+v should settle without a probe", s)
		}
	}
	if s := (Service{Port: 3000, Process: "node"}); classify(&s) {
		t.Error("a node process on 3000 must be probed")
	}
}

func TestScanFindsListeningServer(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<title>scan me</title>`))
	}))
	defer srv.Close()
	port := portOf(t, srv.Listener.Addr())

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	res := Scan(ctx, Options{})
	i := slices.IndexFunc(res.Services, func(s Service) bool { return s.Port == port })
	if i < 0 {
		t.Fatalf("port %d not found among %d services (fallback=%v)", port, len(res.Services), res.Fallback)
	}
	if got := res.Services[i]; got.Kind != KindWeb || got.Title != "scan me" {
		t.Fatalf("got %+v", got)
	}
	t.Logf("scanned %d services in %v", len(res.Services), res.Took)

	if res2 := Scan(ctx, Options{Skip: []int{port}}); slices.ContainsFunc(res2.Services, func(s Service) bool { return s.Port == port }) {
		t.Fatal("Skip ignored")
	}
}

func TestSortServices(t *testing.T) {
	s := []Service{
		{Port: 5432, Kind: KindDatabase},
		{Port: 9999, Kind: KindWeb},
		{Port: 3000, Kind: KindWeb},
		{Port: 8123, Kind: KindAPI},
	}
	sortServices(s)
	var got []int
	for _, x := range s {
		got = append(got, x.Port)
	}
	if !slices.Equal(got, []int{3000, 9999, 8123, 5432}) {
		t.Fatalf("order = %v", got)
	}
}

func TestSameOriginPath(t *testing.T) {
	for in, want := range map[string]string{
		"/login":                   "/login",
		"http://localhost:3000/en": "/en",
		"http://127.0.0.1:3000":    "/",
		"https://example.com/x":    "",
		"http://localhost:9999/en": "",
		"//evil.example/x":         "",
	} {
		got, ok := sameOriginPath(in, 3000)
		if (want == "") == ok || got != want {
			t.Errorf("sameOriginPath(%q) = %q,%v want %q", in, got, ok, want)
		}
	}
}

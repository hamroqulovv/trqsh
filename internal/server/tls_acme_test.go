package server

import (
	"context"
	"crypto/tls"
	"testing"
	"time"
)

// The on-demand DecisionFunc is a security boundary: it must let the edge issue
// certs for its own zone but refuse arbitrary hostnames, or anyone could make us
// hammer Let's Encrypt (rate-limit exhaustion / abuse).
func TestTLSDecision(t *testing.T) {
	s := &Server{cfg: Config{BaseDomain: "trqsh.uz"}, hub: NewHub(), reg: NewInMemoryRegistry()}
	ctx := context.Background()
	for _, h := range []string{"demo.trqsh.uz", "shop.example.com"} {
		if err := s.reg.Bind(ctx, Route{Host: h}, Binding{EdgeID: "e1"}, time.Minute); err != nil {
			t.Fatal(err)
		}
	}

	allowed := []string{"trqsh.uz", "API.trqsh.uz", "www.trqsh.uz.", "demo.trqsh.uz", "shop.example.com"}
	for _, n := range allowed {
		if err := s.tlsDecision(ctx, n); err != nil {
			t.Errorf("tlsDecision(%q) = %v, want allow", n, err)
		}
	}

	// Unbound names inside the zone are what Certificate Transparency scanners
	// probe (www.<seen name>, ...); each would cost a Let's Encrypt order.
	denied := []string{"evil.example.com", "trqsh.uz.attacker.net", "random.io",
		"nobody.trqsh.uz", "www.demo.trqsh.uz", "www.www.abc.trqsh.uz"}
	for _, n := range denied {
		if err := s.tlsDecision(ctx, n); err == nil {
			t.Errorf("tlsDecision(%q) = allow, want deny (unbound name)", n)
		}
	}
}

// With a DNS token the wildcard is managed by a config without on-demand:
// CertMagic only allowlists (never obtains) names managed by an on-demand config.
func TestACMECertManagerManagesWildcardWithoutOnDemand(t *testing.T) {
	cfg := Config{BaseDomain: "trqsh.uz", ACMEEmail: "ops@trqsh.uz", ACMEStaging: true, CloudflareToken: "test"}
	cm, err := newACMECertManager(cfg, nil, func(context.Context, string) error { return nil })
	if err != nil {
		t.Fatalf("newACMECertManager: %v", err)
	}
	if cm.wild == nil || cm.wild.OnDemand != nil {
		t.Fatalf("wildcard config = %+v, want one without OnDemand", cm.wild)
	}
	if cm.magic.OnDemand == nil {
		t.Fatal("custom domains still need the on-demand config")
	}
}

// The ACME manager must build offline and expose an ingress TLS config that can
// actually serve browsers (HTTP/2 + HTTP/1.1) and answer TLS-ALPN challenges.
func TestACMECertManagerBuilds(t *testing.T) {
	cfg := Config{BaseDomain: "trqsh.uz", ACMEEmail: "ops@trqsh.uz", ACMEStaging: true}
	cm, err := newACMECertManager(cfg, nil, func(context.Context, string) error { return nil })
	if err != nil {
		t.Fatalf("newACMECertManager: %v", err)
	}
	tc := cm.TLSConfig()
	if tc.GetCertificate == nil {
		t.Fatal("ingress TLSConfig must set GetCertificate")
	}
	if tc.MinVersion < tls.VersionTLS12 {
		t.Errorf("MinVersion = %x, want >= TLS 1.2", tc.MinVersion)
	}
	want := map[string]bool{"http/1.1": false, "acme-tls/1": false}
	for _, p := range tc.NextProtos {
		if p == "h2" {
			t.Errorf("ingress must not advertise h2 — the edge speaks HTTP/1.1 only")
		}
		if _, ok := want[p]; ok {
			want[p] = true
		}
	}
	for proto, seen := range want {
		if !seen {
			t.Errorf("ingress ALPN missing %q (got %v)", proto, tc.NextProtos)
		}
	}
}

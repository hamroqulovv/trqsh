package platform

import (
	"os"
	"testing"
)

func TestMain(m *testing.M) {
	_ = os.Setenv("TRQSH_RESERVED_SUBDOMAINS", "Stars, shop")
	os.Exit(m.Run())
}

func TestReservedHosts(t *testing.T) {
	const base = "trqsh.uz"
	cases := []struct {
		host                   string
		reserved, controlPlane bool
	}{
		{"trqsh.uz", true, true},
		{"API.trqsh.uz.", true, true},
		{"stars.trqsh.uz", true, false},
		{"shop.trqsh.uz", true, false},
		{"abc123.trqsh.uz", false, false},
		{"x.stars.trqsh.uz", false, false},
		{"stars.example.com", false, false},
	}
	for _, c := range cases {
		if got := ReservedHost(c.host, base); got != c.reserved {
			t.Errorf("ReservedHost(%q) = %v, want %v", c.host, got, c.reserved)
		}
		if got := ControlPlaneHost(c.host, base); got != c.controlPlane {
			t.Errorf("ControlPlaneHost(%q) = %v, want %v", c.host, got, c.controlPlane)
		}
	}
	if !ReservedSubdomain("stars") || ReservedSubdomain("star") {
		t.Error("TRQSH_RESERVED_SUBDOMAINS not honored")
	}
}

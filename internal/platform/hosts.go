// Package platform identifies hostnames owned by the control plane.
package platform

import (
	"os"
	"strings"
	"sync"
)

// extraReserved holds operator-reserved subdomains from
// TRQSH_RESERVED_SUBDOMAINS (comma or space separated), e.g. a co-hosted
// service's name, so no tunnel can claim it. The API and the edge both read it.
var extraReserved = sync.OnceValue(func() map[string]bool {
	out := map[string]bool{}
	for _, s := range strings.FieldsFunc(os.Getenv("TRQSH_RESERVED_SUBDOMAINS"), func(r rune) bool {
		return r == ',' || r == ' ' || r == '\t' || r == '\n'
	}) {
		out[strings.ToLower(s)] = true
	}
	return out
})

func controlPlaneSubdomain(sub string) bool {
	switch sub {
	case "api", "app", "approve", "qr", "www":
		return true
	}
	return false
}

func ReservedSubdomain(sub string) bool {
	sub = strings.ToLower(strings.TrimSpace(sub))
	return controlPlaneSubdomain(sub) || extraReserved()[sub]
}

func ReservedHost(host, base string) bool {
	sub, ok := subdomainOf(host, base)
	return ok && (sub == "" || ReservedSubdomain(sub))
}

// ControlPlaneHost reports whether host is served by the control plane itself
// (apex or a built-in subdomain), as opposed to an operator reservation.
func ControlPlaneHost(host, base string) bool {
	sub, ok := subdomainOf(host, base)
	return ok && (sub == "" || controlPlaneSubdomain(sub))
}

// subdomainOf returns host's label under base ("" for the apex itself).
func subdomainOf(host, base string) (string, bool) {
	host = strings.TrimSuffix(strings.ToLower(strings.TrimSpace(host)), ".")
	base = strings.TrimSuffix(strings.ToLower(strings.TrimSpace(base)), ".")
	if base == "" {
		return "", false
	}
	if host == base {
		return "", true
	}
	if !strings.HasSuffix(host, "."+base) {
		return "", false
	}
	return strings.TrimSuffix(host, "."+base), true
}

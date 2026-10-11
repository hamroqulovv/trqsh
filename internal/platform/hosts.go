// Package platform identifies hostnames owned by the control plane.
package platform

import "strings"

func ReservedSubdomain(sub string) bool {
	switch strings.ToLower(strings.TrimSpace(sub)) {
	case "api", "app", "approve", "qr", "www":
		return true
	}
	return false
}

func ReservedHost(host, base string) bool {
	host = strings.TrimSuffix(strings.ToLower(strings.TrimSpace(host)), ".")
	base = strings.TrimSuffix(strings.ToLower(strings.TrimSpace(base)), ".")
	if base == "" {
		return false
	}
	if host == base {
		return true
	}
	if !strings.HasSuffix(host, "."+base) {
		return false
	}
	return ReservedSubdomain(strings.TrimSuffix(host, "."+base))
}

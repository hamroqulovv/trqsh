package agent

import (
	"strings"
	"testing"
)

func TestValidRemoteCode(t *testing.T) {
	for _, ok := range []string{"WDJB-MJHT-QP7K", "TEST-CODE", "ABC123"} {
		if !validRemoteCode(ok) {
			t.Errorf("%q should be valid", ok)
		}
	}
	for _, bad := range []string{"", "../account", "ABC/DEF", "ABC?x=1", "abc", "A B", "A#B", "A%2FB", strings.Repeat("A", 33)} {
		if validRemoteCode(bad) {
			t.Errorf("%q must be rejected before it is spliced into a request path", bad)
		}
	}
}

func TestSafeRemoteCommand(t *testing.T) {
	for _, ok := range []string{"/status", "/http 3000 --subdomain demo", "3000", "/ls ünï"} {
		if !SafeRemoteCommand(ok) {
			t.Errorf("%q should be accepted", ok)
		}
	}
	for _, bad := range []string{"", "   ", "/ls\n/down", "\x1b[2J", "\x1b]52;c;AAAA\x07", "/status\x00", "/status\u202e", "a b", "bad\xffutf8", strings.Repeat("a", 241)} {
		if SafeRemoteCommand(bad) {
			t.Errorf("%q must be rejected", bad)
		}
	}
}

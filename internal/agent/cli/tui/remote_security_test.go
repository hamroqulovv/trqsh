package tui

import (
	"strings"
	"testing"

	"github.com/trqsh-uz/trqsh/internal/agent"
)

// A phone may only run commands on the explicit allowlist; anything else —
// including commands added later and aliases of them — is refused before it
// is echoed or executed.
func TestRemoteAllowlistRefusesEverythingElse(t *testing.T) {
	for _, c := range slashCommands {
		if remoteAllowed[c.name] {
			continue
		}
		m := &model{}
		cmd := m.handleRemoteEvent(&agent.RemoteEvent{Kind: "command", Command: "/" + c.name})
		joined := strings.Join(m.transcript, "\n")
		if cmd != nil || !strings.Contains(joined, "blocked") || strings.Contains(joined, "📱") {
			t.Errorf("/%s from a phone should be refused, got cmd=%v transcript=%q", c.name, cmd != nil, joined)
		}
	}
	for _, name := range []string{"login", "logout", "setup", "update", "uninstall", "down", "quit", "qr", "tcp", "udp", "subdomains", "domains", "config", "open", "copy"} {
		if remoteAllowed[name] {
			t.Errorf("/%s must not be allowed from a phone", name)
		}
	}
	for alias, target := range commandAliases {
		if remoteAllowed[target] {
			continue
		}
		m := &model{}
		m.handleRemoteEvent(&agent.RemoteEvent{Kind: "command", Command: "/" + alias})
		if !strings.Contains(strings.Join(m.transcript, "\n"), "blocked") {
			t.Errorf("alias /%s (→ %s) from a phone should be refused", alias, target)
		}
	}
}

// Every allowed name must be a real command, or the allowlist has drifted.
func TestRemoteAllowlistNamesExist(t *testing.T) {
	for name := range remoteAllowed {
		if _, ok := lookupCommand(name); !ok {
			t.Errorf("remoteAllowed names unknown command %q", name)
		}
	}
}

func TestRemoteTunnelTargetIsLoopbackOnly(t *testing.T) {
	for _, arg := range []string{"3000", "localhost:3000", "LOCALHOST:8080", "127.0.0.1:5173", "127.1.2.3:80", "[::1]:3000"} {
		if !remoteTunnelTarget(arg) {
			t.Errorf("%q should be an allowed remote tunnel target", arg)
		}
	}
	for _, arg := range []string{
		"", "0", "70000", "--subdomain",
		"169.254.169.254:80", "192.168.1.1:80", "10.0.0.5:22", "0.0.0.0:3000",
		"example.com:443", "http://example.com:80", "localhost:3000@evil.test:80",
		"127.0.0.1:80@evil.test:80", "localhost:abc",
	} {
		if remoteTunnelTarget(arg) {
			t.Errorf("%q must not be an allowed remote tunnel target", arg)
		}
	}
}

func TestRemoteHTTPToNonLocalHostIsBlocked(t *testing.T) {
	for _, line := range []string{"/http 169.254.169.254:80", "/http 192.168.0.1:80", "/http", "/share example.com:443"} {
		m := &model{}
		cmd := m.handleRemoteEvent(&agent.RemoteEvent{Kind: "command", Command: line})
		joined := strings.Join(m.transcript, "\n")
		if cmd != nil || !strings.Contains(joined, "blocked") {
			t.Errorf("%q from a phone should be blocked, got cmd=%v transcript=%q", line, cmd != nil, joined)
		}
	}
}

// Control characters in a phone-sent command never reach the transcript (and
// so never reach the user's terminal).
func TestRemoteCommandWithControlCharactersIsDropped(t *testing.T) {
	for _, line := range []string{"/status\x1b[2J", "\x1b]0;pwned\x07", "/ls\n/down", "/status‮", "  ", "/" + strings.Repeat("a", 300)} {
		m := &model{}
		cmd := m.handleRemoteEvent(&agent.RemoteEvent{Kind: "command", Command: line})
		joined := strings.Join(m.transcript, "\n")
		if cmd != nil || strings.Contains(joined, "\x1b]") || strings.Contains(joined, "\x1b[2J") || strings.Contains(joined, "📱") {
			t.Errorf("command %q should be dropped, got cmd=%v transcript=%q", line, cmd != nil, joined)
		}
	}
}

// A key pasted into /login is echoed into the transcript, which a paired
// viewer mirrors — the echo must not contain it.
func TestLoginKeyIsNotEchoedToPairedViewers(t *testing.T) {
	const secret = "trq_live_SECRETKEY123456"
	m := model{remoteCode: "ABCD-EFGH-JKLM"}
	next, _ := m.run("/login "+secret, false)
	m = next.(model)
	if strings.Contains(strings.Join(m.transcript, "\n"), secret) {
		t.Fatalf("the key reached the transcript: %q", m.transcript)
	}
	for _, l := range m.pendingRemoteLines {
		if strings.Contains(l, secret) {
			t.Fatalf("the key was queued for the paired viewer: %q", l)
		}
	}
}

// Text shown only on the laptop (the device-approval code) must not be queued
// for a paired viewer's mirror, while it still shows locally.
func TestAppendLocalLinesSkipsRemoteMirror(t *testing.T) {
	m := &model{remoteCode: "ABCD-EFGH-JKLM"}
	m.appendLocalLines("code WXYZ-1234")
	if len(m.pendingRemoteLines) != 0 {
		t.Fatalf("local-only line was queued for the viewer: %q", m.pendingRemoteLines)
	}
	if m.remoteCode != "ABCD-EFGH-JKLM" {
		t.Fatalf("remoteCode must be restored, got %q", m.remoteCode)
	}
	if len(m.transcript) != 1 {
		t.Fatalf("line should still show locally: %q", m.transcript)
	}
	m.appendLines("shared line")
	if len(m.pendingRemoteLines) != 1 {
		t.Fatalf("normal lines still mirror: %q", m.pendingRemoteLines)
	}
}

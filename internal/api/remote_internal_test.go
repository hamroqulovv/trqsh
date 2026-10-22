package api

import (
	"strings"
	"testing"
)

func TestNewRemoteCodeShapeAndAlphabet(t *testing.T) {
	seen := map[string]bool{}
	for range 2000 {
		code := newRemoteCode()
		if len(code) != 14 || code[4] != '-' || code[9] != '-' {
			t.Fatalf("unexpected code shape %q", code)
		}
		for i, c := range code {
			if i == 4 || i == 9 {
				continue
			}
			if !strings.ContainsRune(remoteCodeAlphabet, c) {
				t.Fatalf("%q has %q outside the alphabet", code, c)
			}
		}
		if seen[code] {
			t.Fatalf("duplicate code %q in 2000 draws", code)
		}
		seen[code] = true
		if got, ok := canonicalRemoteCode(code); !ok || got != code {
			t.Fatalf("a generated code must be canonical: %q -> %q, %v", code, got, ok)
		}
	}
}

// The first character must not favor the head of the alphabet (the old `% 30`
// over a byte did, by 9 vs 8 in 256).
func TestNewRemoteCodeIsUnbiased(t *testing.T) {
	counts := map[byte]int{}
	const draws = 30000
	for range draws {
		counts[newRemoteCode()[0]]++
	}
	expected := float64(draws) / float64(len(remoteCodeAlphabet))
	for c, n := range counts {
		if float64(n) < expected*0.8 || float64(n) > expected*1.2 {
			t.Fatalf("character %q appeared %d times, expected about %.0f", c, n, expected)
		}
	}
}

func TestCanonicalRemoteCode(t *testing.T) {
	for _, in := range []string{"wdjb-mjht-qp7k", "WDJBMJHTQP7K", " wdjb mjht qp7k ", "WDJB-MJHT-QP7K"} {
		if got, ok := canonicalRemoteCode(in); !ok || got != "WDJB-MJHT-QP7K" {
			t.Fatalf("%q -> %q, %v", in, got, ok)
		}
	}
	for _, in := range []string{"", "..", "../x", "WDJB-MJHT-QP7", "WDJB-MJHT-QP7KK", "AEIU-AEIU-AEIU", "WDJB/MJHT/QP7K", strings.Repeat("A", 200)} {
		if got, ok := canonicalRemoteCode(in); ok {
			t.Fatalf("%q should be rejected, got %q", in, got)
		}
	}
}

func TestCleanRemoteText(t *testing.T) {
	cases := map[string]string{
		"plain":                    "plain",
		"tab\tsep":                 "tab sep",
		"\x1b]52;c;ZXZpbA==\x07ok": "]52;c;ZXZpbA==ok",
		"line\r\nbreak":            "linebreak",
		"c1\u009bcontrol":          "c1control",
		"rtl‮override":             "rtloverride",
		"bad\xffutf8":              "badutf8",
	}
	for in, want := range cases {
		if got := cleanRemoteText(in, 0); got != want {
			t.Errorf("cleanRemoteText(%q) = %q, want %q", in, got, want)
		}
	}
	if got := cleanRemoteText("héllo", 2); got != "h" {
		t.Errorf("truncation must stop on a rune boundary, got %q", got)
	}
}

func TestSanitizeRemoteEvent(t *testing.T) {
	long := strings.Repeat("x", remoteMaxLineBytes*2)
	ev, ok := sanitizeRemoteEvent(remoteEvent{
		Type:      "lines",
		Lines:     []string{"ok", long, "\x1b[31mred"},
		Command:   "forged",
		Connected: true,
	})
	if !ok || ev.Command != "" || ev.Connected || len(ev.Lines) != 3 || len(ev.Lines[1]) != remoteMaxLineBytes || ev.Lines[2] != "[31mred" {
		t.Fatalf("lines not sanitized: ok=%v %#v", ok, ev)
	}

	many := make([]string, remoteMaxPublishLines+50)
	for i := range many {
		many[i] = "l"
	}
	if ev, _ := sanitizeRemoteEvent(remoteEvent{Type: "lines", Lines: many}); len(ev.Lines) != remoteMaxPublishLines {
		t.Fatalf("lines per publish not capped: %d", len(ev.Lines))
	}

	tunnels := make([]remoteTunnel, remoteMaxTunnels+5)
	for i := range tunnels {
		tunnels[i] = remoteTunnel{ID: "t", PublicURL: "https://a.example", Requests: -5}
	}
	tunnels[0].PublicURL = "javascript:alert(1)"
	tunnels[1].PublicURL = "data:text/html,x"
	ev, ok = sanitizeRemoteEvent(remoteEvent{Type: "state", State: &remoteState{Online: true, Tunnels: tunnels}})
	if !ok || len(ev.State.Tunnels) != remoteMaxTunnels {
		t.Fatalf("tunnels not capped: ok=%v", ok)
	}
	if ev.State.Tunnels[0].PublicURL != "" || ev.State.Tunnels[1].PublicURL != "" {
		t.Fatalf("non-http(s) URL survived: %#v", ev.State.Tunnels[:2])
	}
	if ev.State.Tunnels[2].PublicURL != "https://a.example" || ev.State.Tunnels[2].Requests != 0 {
		t.Fatalf("valid tunnel altered: %#v", ev.State.Tunnels[2])
	}

	for _, bad := range []remoteEvent{{Type: "command", Command: "x"}, {Type: "ended"}, {Type: "state"}, {Type: ""}} {
		if _, ok := sanitizeRemoteEvent(bad); ok {
			t.Fatalf("%q must not be accepted as an agent publish", bad.Type)
		}
	}
}

func TestRemoteHubLimits(t *testing.T) {
	h := &remoteHub{sessions: map[string]*remoteSession{}}
	for range remoteMaxSessionsOrg {
		if h.create("org-a") == nil {
			t.Fatal("create under the cap must succeed")
		}
	}
	if h.create("org-a") != nil {
		t.Fatal("create over the per-org cap must fail")
	}
	s := h.create("org-b")
	if s == nil {
		t.Fatal("another org is unaffected by org-a's cap")
	}

	for range remoteMaxViewers {
		if _, _, ok := s.addViewer(); !ok {
			t.Fatal("addViewer under the cap must succeed")
		}
	}
	if _, _, ok := s.addViewer(); ok {
		t.Fatal("addViewer over the cap must fail")
	}

	code := s.code
	h.end(code)
	if _, _, ok := s.addViewer(); ok {
		t.Fatal("addViewer on an ended session must fail (it would never be closed)")
	}
	if _, ok := s.attachAgent(); ok {
		t.Fatal("attachAgent on an ended session must fail")
	}
	if h.get(strings.ToLower(code)) != nil {
		t.Fatal("an ended session must not resolve")
	}
}

func TestRemoteHubGetCanonicalizes(t *testing.T) {
	h := &remoteHub{sessions: map[string]*remoteSession{}}
	s := h.create("org")
	if h.get(strings.ToLower(s.code)) != s || h.get(strings.ReplaceAll(s.code, "-", "")) != s {
		t.Fatal("lowercase / dashless code should resolve to the session")
	}
	if h.get("not-a-code") != nil {
		t.Fatal("garbage must not resolve")
	}
}

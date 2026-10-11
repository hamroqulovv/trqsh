package tui

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/x/ansi"
)

func TestSetupSkipAndReopen(t *testing.T) {
	status := ""
	m := newModel(Options{ShowSetup: true, OnSetupDone: func(s string) error { status = s; return nil }}, nil)
	m.width, m.height, m.ready = 80, 24, true
	if !strings.Contains(m.View(), "Sign in with browser") {
		t.Fatal("welcome missing")
	}
	next, _ := m.setupKey(tea.KeyMsg{Type: tea.KeyEsc})
	m = next.(model)
	if status != "dismissed" || m.setup.stage != "" {
		t.Fatal("skip not saved")
	}
	cmdSetup(&m, nil)
	if m.setup.stage != "welcome" {
		t.Fatal("cannot reopen")
	}
}

func TestSetupKeyNeverEntersTranscript(t *testing.T) {
	m := newModel(Options{ShowSetup: true}, nil)
	m.width, m.height, m.ready = 80, 24, true
	m.setup.selected = 1
	next, _ := m.setupKey(tea.KeyMsg{Type: tea.KeyEnter})
	m = next.(model)
	secret := "tq_live_private_test_key"
	next, _ = m.setupKey(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(secret)})
	m = next.(model)
	if m.setup.input.Value() != secret {
		t.Fatal("input missing")
	}
	if strings.Contains(m.View(), secret) || len(m.history) > 0 || strings.Contains(strings.Join(m.transcript, ""), secret) {
		t.Fatal("credential exposed")
	}
	for _, size := range [][2]int{{20, 4}, {1, 1}, {80, 24}} {
		m.width, m.height = size[0], size[1]
		lines := strings.Split(m.View(), "\n")
		if len(lines) > m.height {
			t.Fatal("overflow rows")
		}
		for _, line := range lines {
			if ansi.StringWidth(line) > m.width {
				t.Fatal("overflow columns")
			}
		}
	}
}

func TestSetupCancellationAndStaleResponse(t *testing.T) {
	m := newModel(Options{ShowSetup: true}, nil)
	m.setup.stage = "waiting"
	ctx, cancel := context.WithCancel(context.Background())
	m.setup.ctx, m.setup.cancel = ctx, cancel
	old := m.setup.generation
	next, _ := m.setupKey(tea.KeyMsg{Type: tea.KeyEsc})
	m = next.(model)
	if ctx.Err() == nil {
		t.Fatal("login not cancelled")
	}
	m.openSetup()
	next, _ = m.setupResult(setupResultMsg{generation: old, ok: true})
	m = next.(model)
	if m.authed || m.setup.stage != "welcome" {
		t.Fatal("stale response changed setup")
	}
}

func TestSetupFailureAllowsRetry(t *testing.T) {
	m := newModel(Options{ShowSetup: true}, nil)
	m.setup.stage = "waiting"
	next, _ := m.setupResult(setupResultMsg{generation: m.setup.generation})
	m = next.(model)
	if m.setup.stage != "welcome" || !strings.Contains(m.setup.note, "failed") {
		t.Fatal("failure trapped user")
	}
	if !remoteBlocked["setup"] {
		t.Fatal("remote setup allowed")
	}
}

func TestSetupLoginAndExplicitTunnelChoice(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/login" {
			t.Errorf("unexpected request %s", r.URL.Path)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	m := newModel(Options{ShowSetup: true}, newClient(strings.TrimPrefix(server.URL, "http://"), ""))
	m.setup.selected = 1
	next, _ := m.setupKey(tea.KeyMsg{Type: tea.KeyEnter})
	m = next.(model)
	m.setup.input.SetValue("fixture-key")
	next, login := m.setupKey(tea.KeyMsg{Type: tea.KeyEnter})
	m = next.(model)
	result := login().(setupResultMsg)
	next, _ = m.setupResult(result)
	m = next.(model)
	if !m.authed || m.setup.stage != "ready" {
		t.Fatal("login did not reach ready")
	}
	// Choosing a tunnel only opens port input; it does not send a bind request.
	next, _ = m.setupKey(tea.KeyMsg{Type: tea.KeyEnter})
	m = next.(model)
	if m.setup.stage != "port" {
		t.Fatal("missing port confirmation")
	}
	m.setup.input.SetValue("70000")
	next, cmd := m.setupKey(tea.KeyMsg{Type: tea.KeyEnter})
	m = next.(model)
	if cmd != nil || m.setup.stage != "port" {
		t.Fatal("invalid port started tunnel")
	}
}

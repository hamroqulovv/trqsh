package tui

import (
	"context"
	"errors"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
	"github.com/muesli/termenv"
	"github.com/trqsh-uz/trqsh/internal/agent"
)

func TestLoadingTracksOverlappingCommands(t *testing.T) {
	m := previewModel(80, 24, false)
	m.opts.OnCheckUpdate = func(context.Context) (string, error) { return "0.1.8", nil }
	next, first := m.run("/update check", false)
	m = next.(model)
	next, second := m.run("/update check", false)
	m = next.(model)
	if len(m.operations) != 2 || !m.loadingActive() {
		t.Fatal("both asynchronous commands should remain in progress")
	}
	m = typeStr(m, "next")
	if !strings.Contains(ansi.Strip(m.View()), "› next") {
		t.Fatal("loading prevented input from being edited")
	}
	// Finish in reverse order: one result must not hide the other operation.
	m = feed(m, second())
	if len(m.operations) != 1 || !m.loadingActive() {
		t.Fatal("the first operation was hidden by the second one's result")
	}
	m = feed(m, first())
	if m.loadingActive() || len(m.frame().loading) != 0 {
		t.Fatal("loading survived the final command result")
	}
	if !strings.Contains(ansi.Strip(m.View()), "update available") {
		t.Fatal("the wrapped command's result was lost")
	}
	// An error must also release its operation and keep its result visible.
	m.opts.OnCheckUpdate = func(context.Context) (string, error) { return "", errors.New("offline") }
	next, failed := m.run("/update check", false)
	m = feed(next.(model), failed())
	if m.loadingActive() || !strings.Contains(ansi.Strip(m.View()), "offline") {
		t.Fatal("failed command kept loading or lost its error")
	}
}

func TestLoadingStartupConnectionAndTimerLifecycle(t *testing.T) {
	m := newModel(Options{}, newClient("127.0.0.1:0", ""))
	m = feed(m, tea.WindowSizeMsg{Width: 80, Height: 24}, dataMsg{ok: true})
	if !m.loadingActive() || !m.pixelTickPending {
		t.Fatal("startup must wait for the account as well as the tunnel list")
	}
	m = feed(m, accountMsg{}) // unauthenticated is a completed account lookup
	next, cmd := m.Update(pixelTickMsg{})
	m = next.(model)
	if m.loadingActive() || m.pixelTickPending || cmd != nil {
		t.Fatal("idle workspace kept scheduling animation ticks")
	}
	tunnels := []agent.Tunnel{{ID: "test", Status: "connecting"}}
	m = feed(m, dataMsg{ok: true, tunnels: tunnels})
	if !m.loadingActive() || !m.pixelTickPending {
		t.Fatal("connection attempt did not resume animation")
	}
	before := m.pixelFrame
	m = feed(m, pixelTickMsg{})
	if m.pixelFrame == before {
		t.Fatal("active animation did not advance")
	}
	m = feed(m, dataMsg{ok: true, tunnels: tunnels, status: agent.Status{Connected: true}})
	next, cmd = m.Update(pixelTickMsg{})
	m = next.(model)
	if m.loadingActive() || cmd != nil {
		t.Fatal("connected workspace kept animating")
	}
	tunnels[0].Status = "error"
	m = feed(m, dataMsg{ok: true, tunnels: tunnels})
	if m.loadingActive() {
		t.Fatal("failed connection was presented as ongoing work")
	}
}

func TestPixelAnimationMovesWithoutColor(t *testing.T) {
	profile := lipgloss.ColorProfile()
	defer lipgloss.SetColorProfile(profile)
	lipgloss.SetColorProfile(termenv.Ascii)
	m := previewModel(80, 24, false)
	m.dataLoaded = false
	seen := map[string]bool{}
	for frame := range 8 {
		m.pixelFrame = frame
		view := m.View()
		if strings.Contains(view, "\x1b[") {
			t.Fatal("no-color terminal received ANSI color sequences")
		}
		seen[view] = true
		for _, row := range m.pixelOrbit() {
			if ansi.StringWidth(row) != 8 {
				t.Fatalf("pixel orbit changed its width: %q", row)
			}
		}
	}
	if len(seen) != 8 {
		t.Fatalf("animation has only %d distinct frames without color", len(seen))
	}
}

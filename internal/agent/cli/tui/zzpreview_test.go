package tui

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/muesli/termenv"
	"github.com/trqsh-uz/trqsh/internal/agent"
)

func previewModel(w, h int, live bool) model {
	m := newModel(Options{Version: "0.1.7"}, newClient("127.0.0.1:0", ""))
	m.dataLoaded, m.accountLoaded = true, true
	m = feed(m, tea.WindowSizeMsg{Width: w, Height: h})
	m.acct = &account{Plan: "pro"}
	m.acct.User.Name = "Developer"
	m.acct.User.Email = "dev@example.com"
	m.status = agent.Status{Connected: true, Edge: "eu", Kind: "quic"}
	if live {
		m.tunnels = []agent.Tunnel{{ID: "preview", PublicURL: "https://tidy-otter.trqsh.uz", LocalAddr: "localhost:3000", Status: "online", Metrics: agent.TunnelMetrics{Requests: 42}}}
		m.pins = []string{"tunnels", "traffic", "status"}
		m.requests = []reqRow{
			{method: "GET", path: "/api/health", status: 200, ms: 12, at: time.Date(2026, 10, 10, 12, 0, 1, 0, time.UTC)},
			{method: "POST", path: "/webhook", status: 201, ms: 38, at: time.Date(2026, 10, 10, 12, 0, 2, 0, time.UTC)},
			{method: "GET", path: "/api/users", status: 503, ms: 1250, at: time.Date(2026, 10, 10, 12, 0, 3, 0, time.UTC)},
		}
		m.appendLines("", stEcho.Render("  › /http 3000"), stOK.Render("  ✓ HTTP tunnel online"), "  "+stURL.Render(m.tunnels[0].PublicURL), stDim.Render("  → localhost:3000"), stDim.Render("  /copy · /open · /pin traffic"))
	}
	m.refreshWelcome()
	m.relayout()
	return m
}

func TestPreviewRender(t *testing.T) {
	// Opt-in export keeps visual QA based on real rendered frames rather than
	// maintaining a separate mockup of the UI.
	if path := os.Getenv("TRQSH_TUI_PREVIEW"); path != "" {
		exportPreview(t, path)
		return
	}
	for _, tc := range []struct {
		w, h int
		live bool
	}{{100, 24, false}, {120, 30, true}, {54, 16, true}} {
		m := previewModel(tc.w, tc.h, tc.live)
		fmt.Printf("\n----%dx%d live=%v----\n", tc.w, tc.h, tc.live)
		fmt.Println(m.View())
	}
	m := previewModel(54, 12, true)
	m.input.SetValue("/")
	m.refreshMenu()
	m.menuIdx = len(m.menuItems) - 1
	m.relayout()
	fmt.Println("\n----54x12 menu----")
	fmt.Println(m.View())
}

func exportPreview(t *testing.T, path string) {
	t.Helper()
	profile, dark := lipgloss.ColorProfile(), lipgloss.HasDarkBackground()
	defer lipgloss.SetColorProfile(profile)
	defer lipgloss.SetHasDarkBackground(dark)
	lipgloss.SetColorProfile(termenv.TrueColor)
	type preview struct {
		Name   string
		Width  int
		Height int
		View   string
	}
	var frames []preview
	for _, tc := range []struct {
		name       string
		w, h       int
		dark, live bool
		menu       bool
	}{
		{"dark-ready", 100, 24, true, false, false},
		{"dark-live", 120, 30, true, true, false},
		{"dark-compact", 54, 16, true, true, false},
		{"dark-menu", 54, 12, true, true, true},
		{"light-live", 120, 30, false, true, false},
	} {
		lipgloss.SetHasDarkBackground(tc.dark)
		m := previewModel(tc.w, tc.h, tc.live)
		if tc.menu {
			m.input.SetValue("/")
			m.refreshMenu()
			m.menuIdx = len(m.menuItems) - 1
			m.relayout()
		}
		frames = append(frames, preview{tc.name, tc.w, tc.h, m.View()})
	}
	lipgloss.SetHasDarkBackground(true)
	for frame := range 8 {
		m := previewModel(80, 20, false)
		m.operations = []loadingOperation{{id: 1, label: "Starting HTTP tunnel", detail: "localhost:3000"}}
		m.pixelFrame = frame
		m.appendLines("", stEcho.Render("  › /http 3000"))
		m.relayout()
		frames = append(frames, preview{fmt.Sprintf("dark-loading-%d", frame), m.width, m.height, m.View()})
	}
	for _, dark := range []bool{true, false} {
		lipgloss.SetHasDarkBackground(dark)
		w, h := 80, 20
		if dark {
			w, h = 54, 12
		}
		m := previewModel(w, h, false)
		m.operations = []loadingOperation{{id: 1, label: "Starting HTTP tunnel", detail: "localhost:3000"}}
		m.pixelFrame = 2
		m.relayout()
		name := "light-loading"
		if dark {
			name = "dark-loading-compact"
		}
		frames = append(frames, preview{name, m.width, m.height, m.View()})
	}
	data, err := json.MarshalIndent(frames, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
}

// TestPreviewInputGrows types a long line into the input box at a few widths
// and prints the result, to eyeball that the box grows downward (wraps) once
// the line is too long for one row, instead of scrolling sideways.
func TestPreviewInputGrows(t *testing.T) {
	long := "this is a pretty long command line that should wrap across more than one row of the input box instead of scrolling off sideways forever"

	for _, w := range []int{100, 60} {
		m := newModel(Options{Version: "0.1.7"}, newClient("127.0.0.1:0", ""))
		m = feed(m, tea.WindowSizeMsg{Width: w, Height: 24})
		m = typeStr(m, long)
		fmt.Printf("\n----width %d, %d chars typed, input.Height()=%d----\n", w, len(long), m.input.Height())
		view := m.View()
		lines := strings.Split(view, "\n")
		fmt.Printf("total view lines: %d (want %d)\n", len(lines), m.height)
		// print just the input box region (last handful of lines before the gap)
		for _, l := range lines[len(lines)-9:] {
			fmt.Println(l)
		}
	}
}

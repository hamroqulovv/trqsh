package tui

import (
	"fmt"
	"strings"
	"testing"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
	"github.com/muesli/termenv"
)

// Exercise the combinations that previously cropped the header: several pins,
// an open command menu, a wrapped input and short or narrow terminal windows.
func TestFramePreservesHeaderAndPrompt(t *testing.T) {
	for _, width := range []int{12, 28, 54, 80, 100, 120} {
		for _, height := range []int{1, 2, 4, 7, 10, 12, 16, 24, 30} {
			for _, mode := range []string{"input", "menu", "paste", "loading", "loading-menu"} {
				t.Run(fmt.Sprintf("%dx%d/%s", width, height, mode), func(t *testing.T) {
					m := previewModel(width, height, true)
					prompt := "› hi"
					switch mode {
					case "menu", "loading-menu":
						m.input.SetValue("/")
						m.refreshMenu()
						m.menuIdx = len(m.menuItems) - 1
						prompt = "› /"
					case "paste":
						m.input.SetValue("first\nsecond\nthird\nlast")
						m.input.CursorEnd()
					default:
						m.input.SetValue("hi")
					}
					if strings.HasPrefix(mode, "loading") {
						m.operations = []loadingOperation{{id: 1, label: "Starting HTTP tunnel", detail: "localhost:3000"}}
					}
					m.relayout()
					plain := ansi.Strip(m.View())
					lines := strings.Split(plain, "\n")
					if len(lines) != height {
						t.Fatalf("frame has %d rows, want %d", len(lines), height)
					}
					for i, line := range lines {
						if cells := ansi.StringWidth(line); cells != width {
							t.Fatalf("row %d has %d cells, want %d: %q", i, cells, width, line)
						}
					}
					if height >= 2 && !strings.Contains(lines[0], "trqsh") {
						t.Fatalf("header was lost: %q", lines[0])
					}
					if mode == "paste" {
						if !strings.Contains(plain, "last") {
							t.Fatalf("active input row was lost:\n%s", plain)
						}
					} else {
						found := false
						for _, line := range lines {
							found = found || strings.TrimSpace(line) == prompt
						}
						if !found {
							t.Fatalf("prompt %q was lost:\n%s", prompt, plain)
						}
					}
					if (mode == "menu" || mode == "loading-menu") && height >= 4 && !strings.Contains(plain, "/quit") {
						t.Fatalf("selected command was lost:\n%s", plain)
					}
				})
			}
		}
	}
}

func TestMenuSelectionSurvivesResize(t *testing.T) {
	m := previewModel(120, 30, true)
	m.input.SetValue("/")
	m.refreshMenu()
	m.menuIdx = len(m.menuItems) - 1
	m = feed(m, tea.WindowSizeMsg{Width: 54, Height: 12})
	if plain := ansi.Strip(m.View()); !strings.Contains(plain, "› /quit") || !strings.Contains(plain, "Esc close") {
		t.Fatalf("selected command or cancel hint was lost after resize:\n%s", plain)
	}
	m = feed(m, tea.KeyMsg{Type: tea.KeyUp})
	if plain := ansi.Strip(m.View()); !strings.Contains(plain, "› /help") {
		t.Fatalf("selected command did not follow the arrow key:\n%s", plain)
	}
}

func TestWelcomeResizePreservesTranscript(t *testing.T) {
	m := previewModel(120, 30, false)
	m.appendLines("History marker")
	m = feed(m, tea.WindowSizeMsg{Width: 28, Height: 12})
	if m.transcript[len(m.transcript)-1] != "History marker" {
		t.Fatal("resize removed command output")
	}
	for _, line := range m.transcript[:m.welcomeLen] {
		if ansi.StringWidth(line) > 26 {
			t.Fatalf("welcome did not adapt to the new width: %q", line)
		}
	}
}

func TestWrappedInputKeepsItsBeginningWhenItFits(t *testing.T) {
	m := previewModel(60, 24, false)
	m = typeStr(m, "begin "+strings.Repeat("wide ", 18)+"end")
	plain := ansi.Strip(m.View())
	if !strings.Contains(plain, "› begin") || !strings.Contains(plain, "end") {
		t.Fatalf("a fitting command was scrolled out of view:\n%s", plain)
	}
}

func TestTrafficColumnsWithUnicodePaths(t *testing.T) {
	r := reqRow{method: "OPTIONS", path: "/用户/🙂/status", status: 503, ms: 38, at: time.Date(2026, 10, 10, 12, 34, 56, 0, time.UTC)}
	for _, width := range []int{26, 32, 48, 69, 70, 96} {
		line := ansi.Strip(requestLine(r, width, true))
		if cells := ansi.StringWidth(line); cells != width {
			t.Errorf("width %d: request has %d cells: %q", width, cells, line)
		}
		if !strings.HasSuffix(line, "! 503   38 ms") {
			t.Errorf("width %d: path displaced status or latency: %q", width, line)
		}
		if cells := ansi.StringWidth(requestHeader(width, true)); cells != width {
			t.Errorf("width %d: header has %d cells", width, cells)
		}
	}
	line := ansi.Strip(requestLine(r, 96, false))
	if ansi.StringWidth(line) != 96 || strings.Contains(line, "12:34:56") || !strings.HasSuffix(line, "! 503   38 ms") {
		t.Fatalf("request without a timestamp has incorrect columns: %q", line)
	}
	for _, width := range []int{12, 16, 20, 25} {
		line := ansi.Strip(requestLine(r, width, true))
		if cells := ansi.StringWidth(line); cells != width {
			t.Errorf("compact width %d: request has %d cells: %q", width, cells, line)
		}
		if !strings.Contains(line, "! 503") || !strings.Contains(line, "38 ms") {
			t.Errorf("compact request lost status or latency at %d cells: %q", width, line)
		}
	}
}

func TestBrandPaletteInLightAndDarkTerminals(t *testing.T) {
	profile, dark := lipgloss.ColorProfile(), lipgloss.HasDarkBackground()
	defer lipgloss.SetColorProfile(profile)
	defer lipgloss.SetHasDarkBackground(dark)
	lipgloss.SetColorProfile(termenv.TrueColor)
	for _, tc := range []struct {
		dark             bool
		text, background string
	}{{true, "38;2;245;245;247", "48;2;12;12;14"}, {false, "38;2;20;20;22", "48;2;255;255;255"}} {
		lipgloss.SetHasDarkBackground(tc.dark)
		view := previewModel(120, 30, true).View()
		if !strings.Contains(view, tc.text) || !strings.Contains(view, tc.background) {
			t.Errorf("dark=%v: frame does not use the web brand's text and page colors", tc.dark)
		}
	}
	lipgloss.SetColorProfile(termenv.Ascii)
	if view := previewModel(54, 16, true).View(); strings.Contains(view, "\x1b[") {
		t.Fatal("monochrome terminal received color escape sequences")
	}
}

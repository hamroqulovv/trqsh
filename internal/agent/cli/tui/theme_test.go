package tui

import (
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
	"github.com/muesli/termenv"
)

func preserveTheme(t *testing.T) {
	t.Helper()
	profile, dark := lipgloss.ColorProfile(), lipgloss.HasDarkBackground()
	t.Cleanup(func() {
		lipgloss.SetColorProfile(profile)
		lipgloss.SetHasDarkBackground(dark)
	})
}

func TestThemeSwitchPreservesHistoryAndLateResults(t *testing.T) {
	preserveTheme(t)
	lipgloss.SetColorProfile(termenv.TrueColor)
	lipgloss.SetHasDarkBackground(true)
	m := previewModel(80, 24, false)
	oldLine := stEcho.Render("History marker") + " " + stURL.Render("https://example.test")
	qr := lipgloss.NewStyle().Foreground(colBrand).Background(lipgloss.Color("#000000")).Render("██  ██")
	m.appendLines(oldLine, qr)
	historyIndex := len(m.transcript) - 2
	cmdTheme(&m, []string{"light"})
	want := stEcho.Render("History marker") + " " + stURL.Render("https://example.test")
	if m.transcript[historyIndex] != want || m.transcript[historyIndex+1] != qr {
		t.Fatal("theme switch lost history styling or changed the QR surface")
	}
	if view := m.View(); !strings.Contains(view, "48;2;255;255;255") || !strings.Contains(view, "38;2;20;20;22") {
		t.Fatal("the frame did not switch to the light palette")
	}
	// A command can finish rendering just before the theme changes and deliver
	// its message afterwards. Its output must still use the active palette.
	m = feed(m, printMsg{lines: []string{oldLine}})
	if m.transcript[len(m.transcript)-1] != want {
		t.Fatal("late command result retained colors from the previous theme")
	}
	cmdTheme(&m, []string{"dark"})
	if m.transcript[historyIndex] != oldLine || m.transcript[historyIndex+1] != qr {
		t.Fatal("round-trip theme switch changed the history or QR")
	}
}

func TestThemeModesAndColorProfiles(t *testing.T) {
	preserveTheme(t)
	for _, profile := range []termenv.Profile{termenv.TrueColor, termenv.ANSI256, termenv.ANSI, termenv.Ascii} {
		for _, terminalDark := range []bool{true, false} {
			lipgloss.SetColorProfile(profile)
			lipgloss.SetHasDarkBackground(terminalDark)
			m := previewModel(54, 16, true)
			m.appendLines(stURL.Render("History marker"))
			for _, mode := range []string{"light", "dark", "auto"} {
				cmdTheme(&m, []string{mode})
				wantDark := mode == "dark" || (mode == "auto" && terminalDark)
				if m.theme != mode || lipgloss.HasDarkBackground() != wantDark {
					t.Fatalf("theme %s did not apply (terminal dark=%v)", mode, terminalDark)
				}
				view := m.View()
				if !strings.Contains(ansi.Strip(strings.Join(m.transcript, "\n")), "History marker") {
					t.Fatal("theme switch removed transcript content")
				}
				if profile == termenv.Ascii && strings.Contains(view, "\x1b[") {
					t.Fatal("theme command enabled colors in a no-color terminal")
				}
			}
			for _, args := range [][]string{{"sepia"}, {"dark", "extra"}} {
				cmdTheme(&m, args)
				if m.theme != "auto" || lipgloss.HasDarkBackground() != terminalDark {
					t.Fatal("invalid theme arguments changed the active theme")
				}
			}
		}
	}
}

func TestThemeKeyboardCommands(t *testing.T) {
	preserveTheme(t)
	lipgloss.SetHasDarkBackground(true)
	m := previewModel(80, 24, false)
	m = typeStr(m, "/theme")
	m = feed(m, tea.KeyMsg{Type: tea.KeyEnter})
	if m.input.Value() != "" || !strings.Contains(ansi.Strip(strings.Join(m.transcript, "\n")), "Theme auto") {
		t.Fatal("Enter on /theme did not report the current theme")
	}
	m = typeStr(m, "/theme ")
	if len(m.menuItems) != 3 {
		t.Fatal("theme autocomplete did not offer auto, dark and light")
	}
	m = typeStr(m, "li")
	if len(m.menuItems) != 1 || m.menuItems[0].insert != "/theme light" {
		t.Fatal("theme argument completion did not filter to light")
	}
	m = feed(m, tea.KeyMsg{Type: tea.KeyEnter})
	if m.theme != "light" || lipgloss.HasDarkBackground() || len(m.operations) != 0 {
		t.Fatal("theme selection was not applied immediately")
	}
}

package tui

import (
	"context"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/trqsh-uz/trqsh/internal/agent"
)

func confirmModel(t *testing.T, onUninstall func(context.Context) (string, error)) model {
	t.Helper()
	m := newModel(Options{Version: "test", OnUninstall: onUninstall}, newClient("127.0.0.1:0", ""))
	return feed(m, tea.WindowSizeMsg{Width: 90, Height: 30})
}

func transcriptText(m model) string { return strings.Join(m.transcript, "\n") }

// /uninstall asks with a dialog instead of demanding "/uninstall yes", and a
// single key answers it.
func TestUninstallConfirmDialog(t *testing.T) {
	calls := 0
	onUninstall := func(context.Context) (string, error) { calls++; return "removed local data", nil }

	m := confirmModel(t, onUninstall)
	m = typeStr(m, "/uninstall")
	m = feed(m, tea.KeyMsg{Type: tea.KeyEnter})
	if m.confirm == nil {
		t.Fatal("/uninstall should open the confirm dialog")
	}
	if m.confirm.choice != 1 {
		t.Fatal("a destructive dialog should start on Cancel")
	}
	if v := m.View(); !strings.Contains(v, "Remove trqsh's local data?") || !strings.Contains(v, "Uninstall (y)") {
		t.Fatalf("dialog not rendered:\n%s", v)
	}

	// Enter on the default (Cancel) does nothing destructive.
	m = feed(m, tea.KeyMsg{Type: tea.KeyEnter})
	if m.confirm != nil || calls != 0 || !strings.Contains(transcriptText(m), "cancelled") {
		t.Fatalf("Enter on Cancel: confirm=%v calls=%d", m.confirm, calls)
	}

	// Esc and n cancel too.
	for _, k := range []tea.KeyMsg{{Type: tea.KeyEsc}, {Type: tea.KeyRunes, Runes: []rune{'n'}}} {
		m = typeStr(m, "/uninstall")
		m = feed(m, tea.KeyMsg{Type: tea.KeyEnter}, k)
		if m.confirm != nil || calls != 0 {
			t.Fatalf("%v should cancel: confirm=%v calls=%d", k, m.confirm, calls)
		}
	}

	// y confirms in one keystroke.
	m = typeStr(m, "/uninstall")
	m = feed(m, tea.KeyMsg{Type: tea.KeyEnter})
	next, cmd := m.confirmKey(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'y'}})
	m = next.(model)
	if m.confirm != nil || cmd == nil {
		t.Fatal("y should close the dialog and start the uninstall")
	}
	cmd()
	if calls != 1 {
		t.Fatalf("uninstall ran %d times, want 1", calls)
	}

	// ←/→ then Enter confirms as well.
	m = typeStr(m, "/uninstall")
	m = feed(m, tea.KeyMsg{Type: tea.KeyEnter}, tea.KeyMsg{Type: tea.KeyLeft})
	if m.confirm == nil || m.confirm.choice != 0 {
		t.Fatal("← should move the highlight to the confirm button")
	}
	if _, cmd = m.confirmKey(tea.KeyMsg{Type: tea.KeyEnter}); cmd == nil {
		t.Fatal("Enter on the confirm button should run it")
	}
	cmd()
	if calls != 2 {
		t.Fatalf("uninstall ran %d times, want 2", calls)
	}
}

// The old spelling still works without a question, so scripts and muscle
// memory keep working.
func TestUninstallYesSkipsDialog(t *testing.T) {
	calls := 0
	m := confirmModel(t, func(context.Context) (string, error) { calls++; return "ok", nil })
	cmd := cmdUninstall(&m, []string{"yes"})
	if m.confirm != nil || cmd == nil {
		t.Fatal("/uninstall yes should run straight away")
	}
	cmd()
	if calls != 1 {
		t.Fatalf("calls = %d, want 1", calls)
	}
}

// Enter on a command that needs a tunnel lists the tunnels to pick from, and
// "all" asks before stopping several.
func TestStopPickerAndConfirm(t *testing.T) {
	m := confirmModel(t, nil)
	m.tunnels = []agent.Tunnel{
		{ID: "aaaa1111", PublicURL: "https://one.trqsh.uz", LocalAddr: "localhost:3000"},
		{ID: "bbbb2222", PublicURL: "https://two.trqsh.uz", LocalAddr: "localhost:5173"},
	}
	m = typeStr(m, "/stop")
	m = feed(m, tea.KeyMsg{Type: tea.KeyEnter})
	if m.input.Value() != "/stop " || len(m.menuItems) != 3 {
		t.Fatalf("input=%q menu=%v, want the two tunnels plus all", m.input.Value(), m.menuItems)
	}
	if !strings.Contains(m.menuItems[1].desc, "two.trqsh.uz") || m.menuItems[2].label != "/stop all" {
		t.Fatalf("menu = %v", m.menuItems)
	}
	// ↑ wraps around to the last entry ("all").
	m = feed(m, tea.KeyMsg{Type: tea.KeyUp}, tea.KeyMsg{Type: tea.KeyEnter})
	if m.confirm == nil || !strings.Contains(m.confirm.title, "2 tunnels") {
		t.Fatalf("/stop all should ask first, confirm = %+v", m.confirm)
	}
	m = feed(m, tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'n'}})
	if m.confirm != nil {
		t.Fatal("n should close the dialog")
	}

	// A paired phone already chose to send the command: no dialog on the laptop.
	next, cmd := m.run("/stop all", true)
	if next.(model).confirm != nil || cmd == nil {
		t.Fatal("remote /stop all should run without a dialog")
	}
}

// Detected ports are suggestions; a port the user typed is never swapped for
// one of them unless they arrow onto it.
func TestPortSuggestionsDontOverrideTypedPort(t *testing.T) {
	m := confirmModel(t, nil)
	m.localPorts = []int{8080, 5173}
	m = typeStr(m, "/http ")
	if len(m.menuItems) != 2 || m.menuItems[0].label != "/http 8080" {
		t.Fatalf("menu = %v, want the detected ports", m.menuItems)
	}
	m = typeStr(m, "80")
	m = feed(m, tea.KeyMsg{Type: tea.KeyEnter})
	if txt := transcriptText(m); !strings.Contains(txt, "localhost:80 ") {
		t.Fatalf("typed /http 80 should start port 80:\n%s", txt)
	}

	m = typeStr(m, "/http ")
	m = feed(m, tea.KeyMsg{Type: tea.KeyDown}, tea.KeyMsg{Type: tea.KeyEnter})
	if txt := transcriptText(m); !strings.Contains(txt, "localhost:5173") {
		t.Fatalf("picking a suggestion should start it:\n%s", txt)
	}
}

func TestSuggestCommand(t *testing.T) {
	for in, want := range map[string]string{
		"stp":      "stop",
		"unistall": "uninstall",
		"hlep":     "help",
		"stat":     "status",
		"xyzzy":    "",
	} {
		if got := suggestCommand(in); got != want {
			t.Errorf("suggestCommand(%q) = %q, want %q", in, got, want)
		}
	}
	// The menu finds commands by alias and by substring, after prefix matches.
	m := confirmModel(t, nil)
	m = typeStr(m, "/kill")
	if len(m.menuItems) == 0 || m.menuItems[0].label != "/stop <id|all>" {
		t.Fatalf("/kill should offer /stop, got %v", m.menuItems)
	}
}

func TestEscClearsLineAndCtrlLClears(t *testing.T) {
	m := confirmModel(t, nil)
	m = typeStr(m, "hello")
	m = feed(m, tea.KeyMsg{Type: tea.KeyEsc})
	if m.input.Value() != "" {
		t.Fatalf("Esc should clear the line, got %q", m.input.Value())
	}
	m.appendLines("some output")
	m = feed(m, tea.KeyMsg{Type: tea.KeyCtrlL})
	if len(m.transcript) != m.welcomeLen {
		t.Fatal("Ctrl+L should clear the transcript back to the welcome banner")
	}
}

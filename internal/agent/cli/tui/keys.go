package tui

// This file holds the console's keyboard layer beyond plain line editing:
// one-key actions for the things people do most once a tunnel is up (open,
// copy, watch traffic), the "?" shortcut sheet, a suggested next step that Tab
// fills in, short-lived footer messages, and Ctrl+C that clears before it
// quits. Every action runs the same slash command a user could type, so its
// result lands in the transcript (and on a paired phone) the usual way.

import (
	"net"
	"slices"
	"strconv"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// flashTTL is how long a footer message stays before the key hints return.
const flashTTL = 2500 * time.Millisecond

type flashDoneMsg struct{ seq int }

// setFlash shows a one-line message in place of the footer's key hints. The
// returned command clears it later, unless a newer message replaced it first.
func (m *model) setFlash(text string, ttl time.Duration) tea.Cmd {
	m.flashSeq++
	m.flash = text
	seq := m.flashSeq
	return tea.Tick(ttl, func(time.Time) tea.Msg { return flashDoneMsg{seq: seq} })
}

func (m *model) clearFlash(msg flashDoneMsg) {
	if msg.seq != m.flashSeq {
		return
	}
	m.flash, m.quitArmed = "", false
}

// quickKey handles the global shortcuts. ok is false for any other key, which
// then falls through to normal editing.
func (m model) quickKey(msg tea.KeyMsg) (tea.Model, tea.Cmd, bool) {
	switch msg.Type {
	case tea.KeyCtrlC:
		// First press clears a half-typed line; on an empty line it arms, and
		// a second press quits. Tunnels live in the daemon, so the warning says
		// so: quitting the console never takes anything offline.
		if m.input.Value() != "" {
			m.clearInput()
			m.relayout()
			return m, nil, true
		}
		if m.quitArmed {
			m.quitting = true
			return m, tea.Quit, true
		}
		m.quitArmed = true
		text := "Press Ctrl+C again to quit"
		if len(m.tunnels) > 0 {
			text += " · tunnels keep running"
		}
		return m, m.setFlash(text, flashTTL), true
	case tea.KeyCtrlD:
		if m.input.Value() == "" {
			m.quitting = true
			return m, tea.Quit, true
		}
	case tea.KeyCtrlO:
		return m.tunnelAction("/open")
	case tea.KeyCtrlY:
		return m.tunnelAction("/copy")
	case tea.KeyCtrlT:
		line := "/pin traffic"
		if slices.Contains(m.pins, "traffic") {
			line = "/unpin traffic"
		}
		next, cmd := m.run(line, false)
		return next, cmd, true
	}
	return m, nil, false
}

// tunnelAction runs a command that needs a tunnel, or explains how to get one.
func (m model) tunnelAction(line string) (tea.Model, tea.Cmd, bool) {
	if len(m.tunnels) == 0 {
		return m, m.setFlash("No tunnel yet · type a port, like 3000, and press Enter", flashTTL), true
	}
	next, cmd := m.run(line, false)
	return next, cmd, true
}

func (m *model) clearInput() {
	m.input.SetValue("")
	m.refreshMenu()
	m.historyIdx = len(m.history)
}

// nextStep is the command the console suggests on an empty prompt (Tab fills
// it in): share the dev server that's running, then watch it get traffic.
func (m model) nextStep() (line, why string) {
	switch {
	case m.confirm != nil || m.loginActive:
		return "", ""
	case len(m.tunnels) == 0 && len(m.localPorts) > 0:
		port := strconv.Itoa(m.localPorts[0])
		return "/http " + port, "share the app on :" + port
	case len(m.tunnels) > 0 && len(m.pins) == 0:
		return "/pin traffic", "watch requests live"
	}
	return "", ""
}

// barePort turns a line typed without a command into the command it
// obviously means: "3000", ":3000", "localhost:3000" or a local URL all share
// that address over HTTP, the most common thing anyone opens the console for.
func barePort(line string) (string, bool) {
	line = strings.TrimSpace(line)
	if line == "" || strings.HasPrefix(line, "/") {
		return "", false
	}
	fields := strings.Fields(line)
	addr := strings.TrimSuffix(fields[0], "/")
	if i := strings.Index(addr, "://"); i >= 0 {
		addr = addr[i+3:]
	}
	addr = strings.TrimPrefix(addr, ":")
	if isPort(addr) {
		return "/http " + strings.Join(append([]string{addr}, fields[1:]...), " "), true
	}
	host, port, err := net.SplitHostPort(addr)
	if err != nil || !isPort(port) {
		return "", false
	}
	switch strings.ToLower(host) {
	case "localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]":
		return "/http " + strings.Join(append([]string{addr}, fields[1:]...), " "), true
	}
	return "", false
}

func isPort(s string) bool {
	n, err := strconv.Atoi(s)
	return err == nil && n > 0 && n < 65536 && !strings.HasPrefix(s, "+")
}

// shortcutRows is the content of the "?" sheet: [key, what it does] pairs,
// laid out in two columns when there's room.
var shortcutRows = [][2]string{
	{"/", "browse commands"},
	{"3000 ⏎", "share a port"},
	{"Tab", "complete · fill suggestion"},
	{"↑ ↓", "history · move in menus"},
	{"Esc", "clear the line"},
	{"Ctrl+O", "open tunnel in browser"},
	{"Ctrl+Y", "copy tunnel URL"},
	{"Ctrl+T", "toggle live traffic"},
	{"PgUp PgDn", "scroll output"},
	{"End", "jump to latest"},
	{"Ctrl+L", "clear the screen"},
	{"Ctrl+C", "clear line · twice to quit"},
}

// renderShortcuts draws the "?" sheet in the rows the frame budget gives it.
func (m model) renderShortcuts(budget int) []string {
	if budget < 1 {
		return nil
	}
	keyW := 0
	for _, r := range shortcutRows {
		keyW = max(keyW, lipgloss.Width(r[0]))
	}
	cell := func(r [2]string, w int) string {
		return padCell(stKey.Render(pad(r[0], keyW))+"  "+stDim.Render(r[1]), w)
	}
	innerW := max(1, m.width-4)
	colW := keyW + 2 + 26
	var rows []string
	if innerW >= colW*2+4 {
		half := (len(shortcutRows) + 1) / 2
		for i := range half {
			line := cell(shortcutRows[i], colW+4)
			if j := i + half; j < len(shortcutRows) {
				line += cell(shortcutRows[j], colW)
			}
			rows = append(rows, line)
		}
	} else {
		for _, r := range shortcutRows {
			rows = append(rows, cell(r, innerW))
		}
	}
	out := []string{"  " + stTitle.Render("SHORTCUTS") + stDim.Render("  any key to close")}
	if budget < 3 {
		out = nil
	}
	for _, r := range rows {
		if len(out) >= budget {
			break
		}
		out = append(out, "  "+r)
	}
	return out
}

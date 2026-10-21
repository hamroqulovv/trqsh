package tui

// This file is the inline yes/no prompt that guards destructive commands
// (/uninstall, /down, /stop all, /logout). Instead of making the user retype
// the command with a magic word ("/uninstall yes"), the command opens a small
// dialog above the prompt: Y or Enter confirms, N or Esc cancels, and ←/→/Tab
// move between the two buttons — one keystroke either way.

import (
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type confirmState struct {
	title   string   // the question, e.g. "Remove trqsh's local data?"
	detail  []string // plain-text lines explaining what will happen
	yes     string   // label of the confirming button, e.g. "Uninstall"
	danger  bool     // destructive: the highlight starts on Cancel, not on yes
	onYes   func(m *model) tea.Cmd
	onYesID string // command name, for the loading indicator
	choice  int    // 0 = yes, 1 = cancel
}

// ask opens the confirm dialog. Commands from a paired phone skip it — the
// phone already chose to send the command, and a dialog popping up on the
// laptop for someone else to answer would be stranger than useful.
func (m *model) ask(c confirmState) tea.Cmd {
	if m.remoteRun {
		return c.onYes(m)
	}
	if c.danger {
		c.choice = 1
	}
	m.confirm = &c
	m.input.SetValue("")
	m.refreshMenu()
	return nil
}

func (m model) confirmKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	c := m.confirm
	accept := func() (tea.Model, tea.Cmd) {
		m.confirm = nil
		cmd := c.onYes(&m)
		if cmd != nil && c.onYesID != "quit" && c.onYesID != "down" {
			cmd = m.trackOperation(c.onYesID, nil, cmd)
		}
		m.relayout()
		return m, cmd
	}
	cancel := func() (tea.Model, tea.Cmd) {
		m.confirm = nil
		m.appendLines(stDim.Render("  cancelled"))
		m.relayout()
		return m, nil
	}
	switch msg.Type {
	case tea.KeyEsc, tea.KeyCtrlC:
		return cancel()
	case tea.KeyEnter:
		if c.choice == 0 {
			return accept()
		}
		return cancel()
	case tea.KeyLeft, tea.KeyRight, tea.KeyTab, tea.KeyShiftTab, tea.KeyUp, tea.KeyDown:
		c.choice = 1 - c.choice
		return m, nil
	}
	switch strings.ToLower(msg.String()) {
	case "y":
		return accept()
	case "n", "q":
		return cancel()
	case "h":
		c.choice = 0
	case "l":
		c.choice = 1
	}
	return m, nil
}

// renderConfirm draws the dialog: a framed question with its details and two
// buttons, sized to fit the rows the frame budget leaves it.
func (m model) renderConfirm(budget int) []string {
	c := m.confirm
	if c == nil || budget < 1 {
		return nil
	}
	button := func(label string, selected bool) string {
		if selected {
			return stMenuSel.Render(" " + label + " ")
		}
		return stSub.Render("[" + label + "]")
	}
	buttons := button(c.yes+" (y)", c.choice == 0) + "  " + button("Cancel (n)", c.choice == 1)
	keys := stDim.Render("←→ choose · Enter select · Esc cancel")

	title := stWarn
	if !c.danger {
		title = stBrand
	}
	w := max(20, m.width-4)
	if budget < 4 || m.width < 30 {
		// Too short for a box: question and buttons on as few rows as fit.
		lines := []string{"  " + title.Render(trunc(c.title, max(1, m.width-4)))}
		if budget >= 2 {
			lines = append(lines, "  "+buttons)
		} else {
			lines[0] += "  " + buttons
		}
		return lines
	}
	body := []string{title.Render(c.title)}
	detailRows := max(0, budget-5) // border ×2, title, blank, buttons
	for i, d := range c.detail {
		if i >= detailRows {
			break
		}
		body = append(body, stDim.Render(trunc(d, w-4)))
	}
	if budget >= 6 {
		body = append(body, "")
	}
	if lipgloss.Width(buttons)+lipgloss.Width(keys)+2 <= w-4 {
		body = append(body, buttons+"  "+keys)
	} else {
		body = append(body, buttons)
	}
	box := roundedBox("", strings.Join(body, "\n"), w, colBorderStrong, colPanelBg)
	lines := strings.Split(box, "\n")
	for i := range lines {
		lines[i] = "  " + lines[i]
	}
	return lines
}

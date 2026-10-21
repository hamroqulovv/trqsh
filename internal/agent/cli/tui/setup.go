package tui

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type setupState struct {
	stage                string
	selected, generation int
	input                textinput.Model
	note, url, code      string
	warn                 bool // note is a problem to fix, not guidance
	ctx                  context.Context
	cancel               context.CancelFunc
}
type setupDeviceMsg struct {
	generation int
	device     *deviceStart
	err        error
}
type setupResultMsg struct {
	generation int
	ok         bool
	pending    bool
	device     *deviceStart
}

func cmdSetup(m *model, _ []string) tea.Cmd {
	if m.loginActive {
		m.appendLines("  Sign-in is already in progress. Finish it before /setup.")
		return nil
	}
	m.openSetup()
	return nil
}
func (m *model) openSetup() {
	if m.setup.cancel != nil {
		m.setup.cancel()
	}
	generation := m.setup.generation + 1
	m.setup = setupState{stage: "welcome", generation: generation}
	if m.authed {
		m.setup.stage = "ready"
	}
}
func (m *model) closeSetup(status string) {
	if m.setup.cancel != nil {
		m.setup.cancel()
	}
	m.setup.stage = ""
	m.setup.input.SetValue("")
	if m.opts.OnSetupDone != nil {
		if err := m.opts.OnSetupDone(status); err != nil {
			m.appendLines("  Could not save setup preference. You can continue using the console.")
		}
	}
	m.relayout()
}
func (m model) setupKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	s := &m.setup
	if msg.Type == tea.KeyCtrlC {
		if s.cancel != nil {
			s.cancel()
		}
		m.quitting = true
		return m, tea.Quit
	}
	if msg.Type == tea.KeyEsc {
		status := "dismissed"
		if s.stage == "ready" || s.stage == "port" {
			status = "completed"
		}
		m.closeSetup(status)
		return m, nil
	}
	if s.stage == "key" || s.stage == "port" {
		if msg.Type != tea.KeyEnter {
			var cmd tea.Cmd
			s.input, cmd = s.input.Update(msg)
			return m, cmd
		}
		value := strings.TrimSpace(s.input.Value())
		if s.stage == "port" {
			port, err := strconv.Atoi(value)
			if err != nil || port < 1 || port > 65535 {
				s.note, s.warn = "Enter a port from 1 to 65535.", true
				return m, nil
			}
			m.closeSetup("completed")
			// Run it as the console command, so the transcript shows what ran
			// and the loading indicator follows it like any other.
			return m.run("/http "+value, false)
		}
		if value == "" {
			s.note, s.warn = "Paste your API key, or press Esc to skip.", true
			return m, nil
		}
		s.input.SetValue("")
		s.stage, s.note, s.warn = "waiting", "Signing in with your key…", false
		s.ctx, s.cancel = context.WithTimeout(context.Background(), 15*time.Second)
		ctx, generation, cl := s.ctx, s.generation, m.cl
		return m, func() tea.Msg {
			err := cl.login(ctx, value)
			return setupResultMsg{generation: generation, ok: err == nil}
		}
	}
	if s.stage == "waiting" {
		return m, nil
	}
	count := len(m.setupChoices())
	key := msg.String()
	// A choice's number picks it outright: "2" is "Use an API key".
	if n, err := strconv.Atoi(key); err == nil && n >= 1 && n <= count {
		s.selected, key = n-1, "enter"
	}
	switch key {
	case "up", "k", "shift+tab":
		s.selected = (s.selected + count - 1) % count
	case "down", "j", "tab":
		s.selected = (s.selected + 1) % count
	case "enter":
		s.warn = false
		if s.stage == "ready" {
			if s.selected == 1 {
				m.closeSetup("completed")
				return m, nil
			}
			port := "3000"
			if len(m.localPorts) > 0 {
				port = strconv.Itoa(m.localPorts[0])
			}
			s.stage, s.note = "port", "Enter starts the tunnel and prints its public URL."
			s.input = newSetupInput()
			s.input.SetValue(port)
			s.input.CharLimit = 5
			return m, textinput.Blink
		}
		switch s.selected {
		case 0:
			s.stage, s.note = "waiting", "Starting browser sign-in…"
			s.ctx, s.cancel = context.WithTimeout(context.Background(), 10*time.Minute)
			ctx, generation, cl := s.ctx, s.generation, m.cl
			return m, func() tea.Msg {
				request, cancel := context.WithTimeout(ctx, 15*time.Second)
				defer cancel()
				d, err := cl.oauthStart(request)
				return setupDeviceMsg{generation, d, err}
			}
		case 1:
			s.stage, s.note = "key", "It's masked here and never saved to command history."
			s.input = newSetupInput()
			s.input.EchoMode = textinput.EchoPassword
			s.input.EchoCharacter = '•'
			s.input.CharLimit = 512
			return m, textinput.Blink
		case 2:
			m.closeSetup("dismissed")
		}
	}
	return m, nil
}
func (m model) setupDevice(msg setupDeviceMsg) (tea.Model, tea.Cmd) {
	if m.setup.stage != "waiting" || msg.generation != m.setup.generation {
		return m, nil
	}
	if msg.err != nil {
		return m.setupResult(setupResultMsg{generation: msg.generation})
	}
	m.setup.url = firstNonEmpty(msg.device.VerificationURIComplete, msg.device.VerificationURI)
	m.setup.code = msg.device.UserCode
	m.setup.note = "Approve sign-in in your browser, or open the address below."
	_ = openBrowser(m.setup.url)
	return m, m.setupPoll(msg.device)
}
func (m model) setupPoll(device *deviceStart) tea.Cmd {
	ctx, generation, cl := m.setup.ctx, m.setup.generation, m.cl
	return func() tea.Msg {
		timer := time.NewTimer(time.Duration(max(2, device.Interval)) * time.Second)
		defer timer.Stop()
		select {
		case <-ctx.Done():
			return setupResultMsg{generation: generation}
		case <-timer.C:
		}
		request, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		ok, pending, err := cl.oauthPoll(request, device.DeviceCode)
		return setupResultMsg{generation: generation, ok: ok, pending: pending && err == nil, device: device}
	}
}
func (m model) setupResult(msg setupResultMsg) (tea.Model, tea.Cmd) {
	if m.setup.stage != "waiting" || msg.generation != m.setup.generation {
		return m, nil
	}
	if msg.pending {
		return m, m.setupPoll(msg.device)
	}
	if m.setup.cancel != nil {
		m.setup.cancel()
	}
	m.setup.url, m.setup.code, m.setup.selected = "", "", 0
	if msg.ok {
		m.authed = true
		m.opts.APIKey = "" // The daemon now owns the newly selected credential.
		m.setup.stage, m.setup.note = "ready", "Signed in. Choose what to do next."
		return m, m.fetchAccount()
	}
	m.setup.stage, m.setup.note, m.setup.warn = "welcome", "Sign-in failed or expired. Try again, or set up later.", true
	return m, nil
}
// setupChoice is one option on the guide's menu; desc shows under the
// highlighted one, so the screen explains itself without a wall of text.
type setupChoice struct{ label, desc, tag string }

func (m model) setupChoices() []setupChoice {
	if m.setup.stage == "ready" {
		share := "Pick a local port and get a public HTTPS URL."
		if len(m.localPorts) > 0 {
			share = fmt.Sprintf("Something is running on :%d — share it in one step.", m.localPorts[0])
		}
		return []setupChoice{
			{"Start an HTTP tunnel", share, "recommended"},
			{"Open the console", "Look around first. Type a port any time to share it.", ""},
		}
	}
	return []setupChoice{
		{"Sign in with browser", "Approve this device in your browser. Nothing to paste.", "recommended"},
		{"Use an API key", "Paste a key from your dashboard.", ""},
		{"Set up later", "Go straight to the console. /setup brings this guide back.", ""},
	}
}

func newSetupInput() textinput.Model {
	in := textinput.New()
	in.Prompt = "› "
	in.PromptStyle = stBrand
	in.TextStyle = stText
	in.PlaceholderStyle = stDim
	in.Cursor.Style = stMenuSel
	in.Focus()
	return in
}

// setupLines draws the guide as a card centered on the page. A terminal too
// small for the card gets just the active choice or input and its keys.
func (m model) setupLines() []string {
	cardW := min(66, m.width-4)
	innerW := cardW - 4
	body, hints := m.setupBody(max(1, innerW))
	if m.width >= 44 {
		box := roundedBox("", strings.Join(append(append([]string{""}, body...), "", hints), "\n"), cardW, colBorder, colPanelBg)
		lines := strings.Split(box, "\n")
		if len(lines) <= m.height {
			left := strings.Repeat(" ", (m.width-cardW)/2)
			for i := range lines {
				lines[i] = left + lines[i]
			}
			// A touch above center reads as centered on a screen.
			top := make([]string, (m.height-len(lines))*2/5)
			return append(top, lines...)
		}
	}
	if lines := append(body, "", hints); len(lines) <= m.height && m.width >= 24 {
		for i := range lines {
			lines[i] = " " + trunc(lines[i], m.width-2)
		}
		return lines
	}
	return m.setupFocus()
}

// setupBody is the card's content, and the key hints for its bottom row.
func (m model) setupBody(w int) (body []string, hints string) {
	s := m.setup
	body = []string{
		logoMark() + "  " + stBrand.Render("trqsh"),
		"    " + stSub.Render("Bring your localhost online."),
		"",
		m.setupSteps(),
		"",
	}
	note := func() {
		if s.note == "" {
			return
		}
		if s.warn {
			body = append(body, "", stWarn.Render("! ")+stSub.Render(s.note))
		} else {
			body = append(body, "", stDim.Render(s.note))
		}
	}
	switch s.stage {
	case "welcome", "ready":
		if s.warn {
			body = append(body, stWarn.Render("! ")+stSub.Render(s.note), "")
		}
		for i, c := range m.setupChoices() {
			num := strconv.Itoa(i + 1)
			if i == s.selected {
				right := num
				if c.tag != "" {
					right = c.tag + "  " + num
				}
				row := padCell("› "+c.label, max(1, w-lipgloss.Width(right)-1)) + " " + right
				body = append(body, stMenuSel.Render(padCell(row, w)), "  "+stDim.Render(c.desc))
				continue
			}
			body = append(body, "  "+stSub.Render(padCell(c.label, max(1, w-3)))+" "+stDim.Render(num))
		}
		hints = keyHints("↑↓", "select", "Enter", "continue", "Esc", "skip")
	case "key":
		body = append(body, stBrand.Render("Paste your API key"), "", s.input.View())
		note()
		hints = keyHints("Enter", "sign in", "Esc", "skip")
	case "port":
		body = append(body, stBrand.Render("Which local port should go online?"), "", s.input.View())
		note()
		hints = keyHints("Enter", "start tunnel", "Esc", "skip")
	case "waiting":
		if s.url != "" {
			body = append(body,
				stBrand.Render("Approve the sign-in in your browser"),
				"",
				stDim.Render("Code  ")+stMenuSel.Render(" "+s.code+" "),
				stDim.Render("Link  ")+stURL.Render(trunc(s.url, max(1, w-6))),
				"",
				m.pixelStrip()+"  "+stDim.Render("Waiting for approval…"),
			)
		} else {
			body = append(body, m.pixelStrip()+"  "+stSub.Render(s.note))
		}
		hints = keyHints("Esc", "cancel")
	}
	return body, hints
}

// setupSteps shows where the guide is: sign in, then share a first port.
func (m model) setupSteps() string {
	first, second := stBrand.Render("● Sign in"), stDim.Render("○ Share a port")
	if m.setup.stage == "ready" || m.setup.stage == "port" {
		first, second = stSub.Render("✓ Signed in"), stBrand.Render("● Share a port")
	}
	return first + stRule.Render("  ────  ") + second
}

// setupFocus is the guide in one or two rows, for the smallest terminals.
func (m model) setupFocus() []string {
	s := m.setup
	focus := "trqsh · " + s.stage
	switch s.stage {
	case "welcome", "ready":
		focus = stMenuSel.Render("› " + m.setupChoices()[s.selected].label)
	case "key", "port":
		focus = s.input.View()
	case "waiting":
		focus = firstNonEmpty(s.code, s.note)
	}
	lines := []string{trunc(focus, max(1, m.width))}
	if m.height > 1 {
		lines = append(lines, trunc(keyHints("Enter", "continue", "Esc", "skip"), max(1, m.width)))
	}
	return lines
}

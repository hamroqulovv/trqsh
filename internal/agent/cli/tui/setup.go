package tui

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/x/ansi"
)

type setupState struct {
	stage                string
	selected, generation int
	input                textinput.Model
	note, url, code      string
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
				s.note = "Enter a port from 1 to 65535."
				return m, nil
			}
			m.closeSetup("completed")
			cmd := cmdHTTP(&m, []string{value})
			return m, cmd
		}
		if value == "" {
			s.note = "Enter your API key, or press Esc to skip."
			return m, nil
		}
		s.input.SetValue("")
		s.stage, s.note = "waiting", "Signing in..."
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
	count := 3
	if s.stage == "ready" {
		count = 2
	}
	switch msg.String() {
	case "up", "k":
		s.selected = (s.selected + count - 1) % count
	case "down", "j", "tab":
		s.selected = (s.selected + 1) % count
	case "enter":
		if s.stage == "ready" {
			if s.selected == 1 {
				m.closeSetup("completed")
				return m, nil
			}
			s.stage, s.note = "port", "Enter the local HTTP port to expose publicly. Enter starts the tunnel."
			s.input = textinput.New()
			s.input.SetValue("3000")
			s.input.CharLimit = 5
			s.input.Focus()
			return m, textinput.Blink
		}
		switch s.selected {
		case 0:
			s.stage, s.note = "waiting", "Starting browser sign-in..."
			s.ctx, s.cancel = context.WithTimeout(context.Background(), 10*time.Minute)
			ctx, generation, cl := s.ctx, s.generation, m.cl
			return m, func() tea.Msg {
				request, cancel := context.WithTimeout(ctx, 15*time.Second)
				defer cancel()
				d, err := cl.oauthStart(request)
				return setupDeviceMsg{generation, d, err}
			}
		case 1:
			s.stage, s.note = "key", "Your key stays out of command history."
			s.input = textinput.New()
			s.input.EchoMode = textinput.EchoPassword
			s.input.EchoCharacter = '*'
			s.input.CharLimit = 512
			s.input.Focus()
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
	m.setup.stage, m.setup.note = "welcome", "Sign-in failed or expired. Try again, or set up later."
	return m, nil
}
func (m model) setupView() string {
	s := m.setup
	lines := []string{stBrand.Render("trqsh / welcome"), "Bring your localhost online.", ""}
	if s.note != "" {
		lines = append(lines, s.note, "")
	}
	choices := []string{"Sign in with browser", "Use an API key", "Set up later"}
	if s.stage == "ready" {
		choices = []string{"Start an HTTP tunnel", "Open console"}
	}
	switch s.stage {
	case "welcome", "ready":
		for i, label := range choices {
			prefix := "  "
			if i == s.selected {
				prefix = "> "
			}
			lines = append(lines, prefix+label)
		}
	case "key", "port":
		lines = append(lines, s.input.View())
	case "waiting":
		if s.url != "" {
			lines = append(lines, s.url, "Code: "+s.code)
		}
	}
	lines = append(lines, "", "Up/Down select | Enter continue | Esc skip")
	var wrapped []string
	for _, line := range lines {
		wrapped = append(wrapped, strings.Split(ansi.Hardwrap(line, max(1, m.width-2), true), "\n")...)
	}
	if len(wrapped) > m.height {
		// Keep the active choice/input visible even in a very short terminal.
		focus := fmt.Sprintf("trqsh | %s", s.stage)
		if s.stage == "welcome" || s.stage == "ready" {
			focus = "> " + choices[s.selected]
		}
		if s.stage == "key" || s.stage == "port" {
			focus = s.input.View()
		}
		if s.stage == "waiting" {
			focus = firstNonEmpty(s.url, s.note)
		}
		wrapped = []string{focus}
		if m.height > 1 {
			wrapped = append(wrapped, "Enter continue | Esc skip")
		}
	}
	for i := range wrapped {
		wrapped[i] = ansi.Truncate(wrapped[i], m.width, "")
	}
	return strings.Join(wrapped, "\n")
}

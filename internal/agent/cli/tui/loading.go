package tui

import (
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/muesli/termenv"
)

const pixelInterval = 120 * time.Millisecond

type pixelTickMsg struct{}

type loadingOperation struct {
	id            int
	label, detail string
}

type operationDoneMsg struct {
	id     int
	result tea.Msg
}

// One timer serves startup, asynchronous commands and connection attempts.
// It stops when no work remains, and never delays the operation's result.
func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	wasLoading := m.loadingActive()
	if done, ok := msg.(operationDoneMsg); ok {
		for i, op := range m.operations {
			if op.id == done.id {
				m.operations = append(m.operations[:i:i], m.operations[i+1:]...)
				break
			}
		}
		msg = done.result
	}
	if _, ok := msg.(pixelTickMsg); ok {
		m.pixelTickPending = false
		if m.loadingActive() {
			m.pixelFrame = (m.pixelFrame + 1) % 8
		}
		return m, m.schedulePixelTick()
	}
	next, cmd := m.update(msg)
	updated := next.(model)
	if wasLoading != updated.loadingActive() {
		updated.relayout()
	}
	tick := updated.schedulePixelTick()
	return updated, tea.Batch(cmd, tick)
}

func (m *model) schedulePixelTick() tea.Cmd {
	if m.quitting || m.pixelTickPending || !m.loadingActive() {
		return nil
	}
	m.pixelTickPending = true
	return tea.Tick(pixelInterval, func(time.Time) tea.Msg { return pixelTickMsg{} })
}

func (m model) loadingActive() bool {
	label, _ := m.loadingText()
	return label != ""
}

func (m model) loadingText() (label, detail string) {
	if n := len(m.operations); n > 0 {
		op := m.operations[n-1]
		if n > 1 {
			return op.label, fmt.Sprintf("%s · +%d in progress", op.detail, n-1)
		}
		return op.label, op.detail
	}
	if !m.dataLoaded || !m.accountLoaded {
		return "Starting workspace", "Loading tunnels and account"
	}
	if m.loginActive || m.setup.stage == "waiting" {
		return "Waiting for sign-in", "Approve in your browser"
	}
	if _, state, _ := m.connState(); state == "connecting" {
		return "Connecting to edge", firstNonEmpty(m.status.Edge, "Establishing a secure connection")
	}
	return "", ""
}

func (m *model) trackOperation(name string, args []string, cmd tea.Cmd) tea.Cmd {
	m.nextOperation++
	op := loadingOperation{id: m.nextOperation, label: "Running /" + name, detail: "Waiting for a response"}
	switch name {
	case "http", "tcp", "udp":
		op.label = "Starting " + strings.ToUpper(name) + " tunnel"
		if len(args) > 0 {
			op.detail = normalizeAddr(args[0])
		}
	case "start":
		op.label, op.detail = "Starting tunnels", "Reading your configuration"
	case "login":
		op.label, op.detail = "Signing in", "Connecting to your account"
	case "update":
		op.label, op.detail = "Checking for updates", "Fetching the latest release"
		if len(args) == 0 || !strings.EqualFold(args[0], "check") {
			op.label = "Updating trqsh"
		}
	case "requests":
		op.label, op.detail = "Loading requests", "Fetching captured traffic"
	}
	m.operations = append(m.operations, op)
	return func() tea.Msg { return operationDoneMsg{id: op.id, result: cmd()} }
}

func (m model) pixelGlyph() string {
	return [...]string{"▘", "▀", "▝", "▐", "▗", "▄", "▖", "▌"}[m.pixelFrame%8]
}

// Two cells form a square pixel. Color-capable terminals use solid tiles;
// limited palettes use texture to keep the trail visibly moving.
func (m model) pixelOrbit() []string {
	path := [...]int{0, 1, 2, 5, 8, 7, 6, 3}
	profile := lipgloss.ColorProfile()
	textured := profile == termenv.Ascii || profile == termenv.ANSI
	tile := func(style lipgloss.Style, shape string) string {
		if !textured {
			shape = "██"
		}
		return style.Render(shape)
	}
	trail := lipgloss.NewStyle().Foreground(colBorderStrong)
	tiles := make([]string, 9)
	for i := range tiles {
		tiles[i] = tile(stRule, "░░")
	}
	tiles[4] = tile(trail, "▪▪")
	for age := 3; age >= 0; age-- {
		index := path[(m.pixelFrame-age+8)%8]
		switch age {
		case 0:
			tiles[index] = tile(stText, "██")
		case 1:
			tiles[index] = tile(stSub, "▓▓")
		case 2:
			tiles[index] = tile(stDim, "▒▒")
		case 3:
			tiles[index] = tile(trail, "░░")
		}
	}
	return []string{strings.Join(tiles[:3], " "), strings.Join(tiles[3:6], " "), strings.Join(tiles[6:], " ")}
}

func (m model) pixelStrip() string {
	var tiles []string
	for i := range 8 {
		age := (m.pixelFrame - i + 8) % 8
		switch age {
		case 0:
			tiles = append(tiles, stText.Render("■"))
		case 1, 2:
			tiles = append(tiles, stDim.Render("▪"))
		default:
			tiles = append(tiles, stRule.Render("▪"))
		}
	}
	return strings.Join(tiles, " ")
}

func (m model) renderLoading(rows int) []string {
	label, detail := m.loadingText()
	if rows < 1 || label == "" {
		return nil
	}
	if rows < 3 || m.width < 44 {
		pixels := m.pixelStrip()
		if m.width < 40 {
			pixels = stText.Render(m.pixelGlyph())
		}
		return []string{"  " + pixels + "  " + stText.Render(label)}
	}
	orbit := m.pixelOrbit()
	return []string{
		"  " + orbit[0] + "   " + stBrand.Render(label),
		"  " + orbit[1] + "   " + stDim.Render(trunc(detail, max(1, m.width-15))),
		"  " + orbit[2] + "   " + m.pixelStrip(),
	}
}

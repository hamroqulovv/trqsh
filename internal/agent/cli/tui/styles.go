package tui

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
)

// These light/dark tokens mirror web/site/app/globals.css and
// web/dashboard/app/globals.css. Lip Gloss adapts them to the terminal's
// background and available color depth.
var (
	colBrand        = lipgloss.AdaptiveColor{Light: "#141416", Dark: "#F5F5F7"}
	colSecondary    = lipgloss.AdaptiveColor{Light: "#55555B", Dark: "#BEBEC6"}
	colDim          = lipgloss.AdaptiveColor{Light: "#6A6A71", Dark: "#9D9DA8"}
	colGood         = lipgloss.AdaptiveColor{Light: "#28282D", Dark: "#D4D4DB"}
	colWarning      = lipgloss.AdaptiveColor{Light: "#6E6E74", Dark: "#9D9DA8"}
	colCritical     = lipgloss.AdaptiveColor{Light: "#37373C", Dark: "#E6E6EC"}
	colBorder       = lipgloss.AdaptiveColor{Light: "#E5E5E8", Dark: "#303038"}
	colBorderStrong = lipgloss.AdaptiveColor{Light: "#CACACF", Dark: "#5D5D69"}
	colPage         = lipgloss.AdaptiveColor{Light: "#FFFFFF", Dark: "#0C0C0E"}
	colPanelBg      = lipgloss.AdaptiveColor{Light: "#F7F7F7", Dark: "#121215"}
	colSelectedText = lipgloss.AdaptiveColor{Light: "#FFFFFF", Dark: "#141416"}
)

var (
	stBrand   = lipgloss.NewStyle().Foreground(colBrand).Bold(true)
	stTitle   = lipgloss.NewStyle().Foreground(colSecondary).Bold(true)
	stText    = lipgloss.NewStyle().Foreground(colBrand)
	stSub     = lipgloss.NewStyle().Foreground(colSecondary)
	stDim     = lipgloss.NewStyle().Foreground(colDim)
	stRule    = lipgloss.NewStyle().Foreground(colBorder)
	stKey     = lipgloss.NewStyle().Foreground(colBrand).Bold(true)
	stURL     = lipgloss.NewStyle().Foreground(colBrand).Bold(true)
	stOK      = lipgloss.NewStyle().Foreground(colGood)
	stErr     = lipgloss.NewStyle().Foreground(colCritical).Bold(true)
	stWarn    = lipgloss.NewStyle().Foreground(colWarning).Bold(true)
	stEcho    = lipgloss.NewStyle().Foreground(colBrand).Bold(true)
	stMenuSel = lipgloss.NewStyle().Foreground(colSelectedText).Background(colBrand).Bold(true)
)

// lipglossFg renders s in foreground color c — a shorthand for the one-off
// dynamically-colored spans (like the connection dot) that don't warrant a
// named style.
func lipglossFg(c lipgloss.TerminalColor, s string) string {
	return lipgloss.NewStyle().Foreground(c).Render(s)
}

// boldFg renders s bold in foreground color c (for /help section headers).
func boldFg(c lipgloss.TerminalColor, s string) string {
	return lipgloss.NewStyle().Foreground(c).Bold(true).Render(s)
}

// Status codes remain readable in monochrome; errors gain weight rather than
// introducing colors that are absent from the web brand.
func statusStyle(code int) lipgloss.Style {
	switch {
	case code >= 500:
		return stErr
	case code >= 400:
		return stWarn
	case code >= 300:
		return stSub
	case code >= 200:
		return stText
	default:
		return stDim
	}
}

// roundedBox renders body inside a rounded box of the given OUTER width, with an
// optional title spliced into the top border and an optional background so the
// box reads as a raised surface. body may contain ANSI (its own colors survive).
func roundedBox(title, body string, outerW int, border, bg lipgloss.TerminalColor) string {
	st := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(border).
		Width(outerW-2). // Width is the content+padding box; the border adds 2
		Padding(0, 1)
	if bg != nil {
		st = st.Background(bg).BorderBackground(bg)
		body = fillBg(body, bg) // keep the background continuous across colored spans
	}
	return spliceTitle(st.Render(body), title, border, bg)
}

// Nested styles end with a full SGR reset. Restore the enclosing surface after
// each one, including its text color when rendering the page on a light theme.
func fillStyle(content string, style lipgloss.Style) string {
	s := style.Render("\x00")
	i := strings.IndexByte(s, 0)
	if i <= 0 {
		return content
	}
	seq := s[:i]
	return seq + strings.ReplaceAll(content, "\x1b[0m", "\x1b[0m"+seq)
}

func fillBg(content string, bg lipgloss.TerminalColor) string {
	return fillStyle(content, lipgloss.NewStyle().Background(bg))
}

// panelBox uses the same quiet frame for every live panel.
func panelBox(title, body string, outerW int) string {
	return roundedBox(title, body, outerW, colBorder, colPanelBg)
}

// A single divider leaves more room for output and wrapped commands.
func inputBox(body string, outerW int) string {
	return lipgloss.NewStyle().Foreground(colBorderStrong).Render(strings.Repeat("─", max(0, outerW))) + "\n" + body
}

// spliceTitle overwrites the top border of a rendered box with "╭─ title ─…─╮",
// keeping the frame color and background. It rebuilds the line from scratch (the
// original top edge is a single uniform run, so nothing else is lost).
func spliceTitle(box, title string, fg, bg lipgloss.TerminalColor) string {
	if title == "" {
		return box
	}
	lines := strings.Split(box, "\n")
	if len(lines) == 0 {
		return box
	}
	w := lipgloss.Width(lines[0])
	frame := lipgloss.NewStyle().Foreground(fg).Background(bg)
	titleStyle := lipgloss.NewStyle().Foreground(colSecondary).Background(bg).Bold(true)
	head := "╭─ "
	tail := " "
	dashCount := w - lipgloss.Width(head) - lipgloss.Width(title) - lipgloss.Width(tail) - 1
	if dashCount < 0 {
		return box // too narrow for a title; leave the plain border
	}
	lines[0] = frame.Render(head) + titleStyle.Render(title) + frame.Render(tail+strings.Repeat("─", dashCount)+"╮")
	return strings.Join(lines, "\n")
}

// fitLines pads (or truncates) body to exactly n lines of width w, so panels in
// a horizontal row share a height and edge cleanly.
func fitLines(body []string, n, w int) []string {
	out := make([]string, 0, n)
	for i := range n {
		if i < len(body) {
			line := body[i]
			if lipgloss.Width(line) > w {
				line = ansi.Truncate(line, w, "…")
			}
			out = append(out, line)
		} else {
			out = append(out, "")
		}
	}
	return out
}

// HTTP verbs are labels, not success/error indicators.
func methodStyle(_ string) lipgloss.Style {
	return stText.Bold(true)
}

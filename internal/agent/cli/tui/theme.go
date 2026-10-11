package tui

import (
	"io"
	"regexp"
	"strconv"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/muesli/termenv"
)

func cmdTheme(m *model, args []string) tea.Cmd {
	if len(args) == 0 {
		variant := "light"
		if lipgloss.HasDarkBackground() {
			variant = "dark"
		}
		m.appendLines("  "+stTitle.Render("Theme ")+stKey.Render(firstNonEmpty(m.theme, "auto"))+stDim.Render(" · "+variant),
			stDim.Render("  /theme dark · /theme light · /theme auto"))
		return nil
	}
	mode := strings.ToLower(args[0])
	if len(args) != 1 || (mode != "auto" && mode != "dark" && mode != "light") {
		m.appendLines(stErr.Render("  ✗ usage: ") + stKey.Render("/theme <auto|dark|light>"))
		return nil
	}
	dark := mode == "dark" || (mode == "auto" && m.terminalDark)
	m.theme = mode
	lipgloss.SetHasDarkBackground(dark)
	m.themeColors = themeForegroundColors(dark, lipgloss.ColorProfile())
	transcript := make([]string, len(m.transcript))
	for i, line := range m.transcript {
		transcript[i] = rethemeLine(line, m.themeColors)
	}
	m.transcript = transcript
	m.refreshWelcome()
	m.appendLines(stOK.Render("  ✓ theme set to ") + stKey.Render(mode))
	m.relayout()
	return nil
}

// Transcript lines already contain ANSI, including results prepared by an
// asynchronous command just before a theme switch. Map either palette to the
// active one without removing bold text, links or the command history.
func themeForegroundColors(dark bool, profile termenv.Profile) map[string]string {
	colors := []lipgloss.AdaptiveColor{colBrand, colSecondary, colDim, colGood, colWarning, colCritical}
	renderer := lipgloss.NewRenderer(io.Discard)
	renderer.SetColorProfile(profile)
	code := func(color lipgloss.AdaptiveColor) string {
		prefix, _, _ := strings.Cut(renderer.NewStyle().Foreground(color).Render("\x00"), "\x00")
		return strings.TrimSuffix(strings.TrimPrefix(prefix, "\x1b["), "m")
	}
	renderer.SetHasDarkBackground(dark)
	targets := make([]string, len(colors))
	for i, color := range colors {
		targets[i] = code(color)
	}
	replacements := map[string]string{}
	for _, sourceDark := range []bool{dark, !dark} {
		renderer.SetHasDarkBackground(sourceDark)
		for i, color := range colors {
			if source := code(color); source != "" {
				if _, exists := replacements[source]; !exists {
					replacements[source] = targets[i]
				}
			}
		}
	}
	return replacements
}

var themeSGR = regexp.MustCompile(`\x1b\[([0-9;]*)m`)

func sgrColorLength(params []string, i int) int {
	if (params[i] == "38" || params[i] == "48") && i+1 < len(params) {
		switch params[i+1] {
		case "2":
			return min(5, len(params)-i)
		case "5":
			return min(3, len(params)-i)
		}
	}
	return 1
}

func rethemeLine(line string, colors map[string]string) string {
	if len(colors) == 0 {
		return line
	}
	// QR codes use their own foreground/background pair. Keep those surfaces
	// intact instead of treating their black/white pixels as brand text.
	for _, match := range themeSGR.FindAllStringSubmatch(line, -1) {
		params := strings.Split(match[1], ";")
		for i := 0; i < len(params); {
			code, _ := strconv.Atoi(params[i])
			if code == 48 || (code >= 40 && code <= 47) || (code >= 100 && code <= 107) {
				return line
			}
			i += sgrColorLength(params, i)
		}
	}
	return themeSGR.ReplaceAllStringFunc(line, func(sequence string) string {
		params := strings.Split(sequence[2:len(sequence)-1], ";")
		var result []string
		for i := 0; i < len(params); {
			n := sgrColorLength(params, i)
			color := strings.Join(params[i:i+n], ";")
			if replacement, ok := colors[color]; ok {
				result = append(result, replacement)
			} else {
				result = append(result, params[i:i+n]...)
			}
			i += n
		}
		return "\x1b[" + strings.Join(result, ";") + "m"
	})
}

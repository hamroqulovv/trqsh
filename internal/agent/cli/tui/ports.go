package tui

// The localhost scanner's console surface: the background scan that runs at
// startup, the /ports card, and the labels the welcome screen and /http picker
// use for what was found. The scanning itself lives in package portscan.

import (
	"context"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/trqsh-uz/trqsh/internal/agent/portscan"
)

// scanPorts scans localhost in the background. It's quick (an OS table read plus
// one tiny request per candidate, all in parallel) and runs at startup, whenever
// /ports is typed, and again when a port picker opens on a stale result.
func (m model) scanPorts() tea.Cmd {
	var skip []int
	if _, p, err := net.SplitHostPort(m.opts.Addr); err == nil {
		if n, err := strconv.Atoi(p); err == nil {
			skip = append(skip, n)
		}
	}
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		return portsMsg{res: portscan.Scan(ctx, portscan.Options{Skip: skip})}
	}
}

// maybeScanPorts re-scans when a port picker is open and the result is stale.
func (m *model) maybeScanPorts() tea.Cmd {
	if m.probing || !m.menuFreeform || time.Since(m.portsAt) < 3*time.Second {
		return nil
	}
	m.probing = true
	return m.scanPorts()
}

// shareablePorts are the detected HTTP servers, in the order to suggest them.
func shareablePorts(svcs []portscan.Service) []int {
	var out []int
	for _, s := range svcs {
		if s.Kind.Shareable() {
			out = append(out, s.Port)
		}
	}
	return out
}

// serviceOn returns the detected service listening on port.
func (m model) serviceOn(port int) (portscan.Service, bool) {
	for _, s := range m.scan.Services {
		if s.Port == port {
			return s, true
		}
	}
	return portscan.Service{}, false
}

// describeService is the one-line label for a service: "Vite · “My App”".
func describeService(s portscan.Service) string {
	d := s.Name()
	if s.Title != "" {
		d += " · “" + s.Title + "”"
	}
	return d
}

// sharedURLs maps a local port to the public URL of the tunnel exposing it.
func (m model) sharedURLs() map[int]string {
	out := map[int]string{}
	for _, t := range m.tunnels {
		if _, p, err := net.SplitHostPort(normalizeAddr(t.LocalAddr)); err == nil {
			if n, err := strconv.Atoi(p); err == nil {
				out[n] = t.PublicURL
			}
		}
	}
	return out
}

// portsSummary is the welcome screen's /ports hint, counting what the startup
// scan found so the row advertises itself with a real number.
func (m model) portsSummary() string {
	shown, _ := visibleServices(m.scan.Services, false)
	if len(shown) == 0 {
		return "See what's running on localhost"
	}
	return fmt.Sprintf("%d running on localhost — see what each one is", len(shown))
}

// visibleServices drops OS services and desktop-app helpers unless all is set.
func visibleServices(svcs []portscan.Service, all bool) (shown []portscan.Service, hidden int) {
	for _, s := range svcs {
		if s.Kind == portscan.KindSystem && !all {
			hidden++
			continue
		}
		shown = append(shown, s)
	}
	return shown, hidden
}

func cmdPorts(m *model, args []string) tea.Cmd {
	m.portsAll = len(args) > 0 && (args[0] == "all" || args[0] == "-a" || args[0] == "--all")
	m.reportPorts = true
	if m.probing {
		return nil // the scan in flight will print when it lands
	}
	m.probing = true
	return m.scanPorts()
}

// portsLines renders the /ports result: a card of what's listening, then what
// was left out and the next keys.
func (m model) portsLines(all bool) []string {
	res := m.scan
	shown, hidden := visibleServices(res.Services, all)
	if len(shown) == 0 {
		out := []string{"", stSub.Render("  Nothing is running on localhost yet.") + stDim.Render(" Start a dev server, then run ") + stKey.Render("/ports") + stDim.Render(" again.")}
		if hidden > 0 {
			out = append(out, stDim.Render("  "+plural(hidden, "system service")+" hidden · ")+stKey.Render("/ports all"))
		}
		return append(out, "  "+stDim.Render("scanned in "+fmtTook(res.Took)))
	}

	shared := m.sharedURLs()
	// Column widths come from the data, then shrink to fit: the title is
	// the first thing to give way, the port and app are what people scan for.
	appW, titleW, procW := 0, 0, 0
	rows := make([]portRow, len(shown))
	for i, s := range shown {
		r := portRow{s: s, app: s.Name(), title: rowDetail(s), proc: rowProc(s)}
		rows[i] = r
		appW = max(appW, lipgloss.Width(r.app))
		titleW = max(titleW, lipgloss.Width(r.title))
		procW = max(procW, lipgloss.Width(r.proc))
	}
	appW = min(appW, 20)
	procW = min(procW, 20)
	const portW = 6 // ":65535"
	// The card's inner width is the terminal minus the 2-col indent, the
	// 2-col margin and the 4 cols of border and padding. Mark, port and app
	// always show; the process column goes first when space is tight, then
	// the title shrinks to what's left.
	remaining := m.width - 8 - (2 + portW + 2 + appW)
	showProc := procW > 0 && remaining-(2+procW) >= min(titleW, 14)
	if showProc {
		remaining -= 2 + procW
	}
	titleW = min(titleW, remaining-2)
	if titleW < 4 {
		titleW = 0
	}

	body := make([]string, 0, len(rows))
	contentW := 0
	for _, r := range rows {
		mark := "  "
		if _, ok := shared[r.s.Port]; ok {
			mark = "↗ "
		}
		active := r.s.Kind.Shareable()
		portStyle, appStyle := stDim, stDim
		if active {
			portStyle, appStyle = stKey, stText
		}
		line := stSub.Render(mark) + portStyle.Render(pad(":"+strconv.Itoa(r.s.Port), portW)) + "  " +
			appStyle.Render(padCell(r.app, appW))
		if titleW > 0 {
			line += "  " + stSub.Render(padCell(r.title, titleW))
		}
		if showProc {
			line += "  " + stDim.Render(trunc(r.proc, procW))
		}
		contentW = max(contentW, lipgloss.Width(line))
		body = append(body, line)
	}

	n := 0
	for _, s := range shown {
		if s.Kind.Shareable() {
			n++
		}
	}
	title := fmt.Sprintf("localhost · %d running", len(shown))
	if n > 0 && n != len(shown) {
		title = fmt.Sprintf("localhost · %d apps · %d other", n, len(shown)-n)
	}
	out := append([]string{""}, card(title, body, cardWidth(m.width, contentW))...)

	// Legend for the marks used in the card, then what was left out and how
	// long it took — two short lines instead of one that truncates.
	var legend, stats []string
	if len(shared) > 0 {
		legend = append(legend, "↗ already shared")
	}
	if hasNetworkBind(shown) {
		legend = append(legend, "lan = open to your network")
	}
	if len(legend) > 0 {
		out = append(out, trunc("  "+stDim.Render(strings.Join(legend, " · ")), max(1, m.width-2)))
	}
	if hidden > 0 {
		stats = append(stats, plural(hidden, "system service")+" hidden")
	}
	stats = append(stats, "scanned in "+fmtTook(res.Took))
	if res.Fallback {
		stats = append(stats, "limited scan — OS socket table unavailable")
	}
	out = append(out, trunc("  "+stDim.Render(strings.Join(stats, " · ")), max(1, m.width-2)))

	hint := []string{"/", "commands"}
	for _, r := range rows {
		if r.s.Kind.Shareable() {
			if _, ok := shared[r.s.Port]; !ok {
				hint = []string{"/http " + strconv.Itoa(r.s.Port), "share it", "/ports all", "everything"}
				break
			}
		}
	}
	return append(out, trunc("  "+keyHints(hint...), max(1, m.width-2)))
}

type portRow struct {
	s                portscan.Service
	app, title, proc string
}

// rowDetail is the middle column: the page title, else what the response was.
func rowDetail(s portscan.Service) string {
	switch {
	case s.Title != "":
		return "“" + s.Title + "”"
	case s.Detail != "":
		return s.Detail
	case s.Scheme == "https":
		return "https"
	default:
		return ""
	}
}

// rowProc is the last column: the owning process, flagged when it listens on
// every network interface rather than just this machine.
func rowProc(s portscan.Service) string {
	p := s.Process
	if s.Network {
		if p != "" {
			p += " · "
		}
		p += "lan"
	}
	return p
}

func hasNetworkBind(svcs []portscan.Service) bool {
	for _, s := range svcs {
		if s.Network {
			return true
		}
	}
	return false
}

func fmtTook(d time.Duration) string {
	if d < time.Second {
		return fmt.Sprintf("%d ms", max(1, d.Milliseconds()))
	}
	return fmt.Sprintf("%.1f s", d.Seconds())
}

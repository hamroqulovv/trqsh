package tui

import (
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
	"github.com/muesli/termenv"
)

// Both relayout and View use this budget. Optional panels and menus shrink
// before the header or prompt, so a small terminal never crops from the top.
type frameLayout struct {
	header, pins, loading, menu, prompt, footer []string
	viewportRows                                int
	scrollHint                                  bool
}

func (m model) frame() frameLayout {
	var f frameLayout
	if m.height < 1 {
		return f
	}
	if m.height >= 2 {
		f.header = append(f.header, m.renderHeader())
	}
	if m.height >= 7 {
		f.header = append(f.header, stRule.Render(m.rule()))
	}
	f.prompt = strings.Split(m.renderInputBox(m.height >= 7), "\n")
	if m.height >= 4 {
		f.footer = append(f.footer, m.renderHint())
	}
	if m.height >= 12 {
		f.footer = append(f.footer, "")
		f.scrollHint = true
	}
	room := max(0, m.height-len(f.header)-len(f.prompt)-len(f.footer))
	if f.scrollHint {
		room--
	}
	room = max(0, room)
	if m.confirm != nil && room > 0 {
		// The dialog takes the menu's slot; it gets more rows because the
		// question and what it will do are the whole point.
		f.menu = m.renderConfirm(min(4+len(m.confirm.detail)+1, max(1, room-2)))
	} else if m.showKeys && room > 0 {
		f.menu = m.renderShortcuts(min(len(shortcutRows)+1, max(1, room-2)))
	} else if m.menuOpen() && room > 0 {
		// Always leave at least one selectable row, even in a short window.
		menuBudget := min(8, max(1, room-min(3, room-1)))
		f.menu = m.renderMenu(menuBudget)
	}
	room -= len(f.menu)
	if m.loadingActive() && room > 0 {
		rows := 1
		if room >= 8 && m.width >= 44 && !m.menuOpen() {
			rows = 3
		}
		f.loading = m.renderLoading(rows)
		room -= len(f.loading)
	}
	// Keep enough transcript context to read an operation's result. Wide
	// terminals use one row of panels; narrow ones use one-line summaries.
	f.pins = m.renderPinnedBlock(min(6, max(0, room-min(5, room))))
	f.viewportRows = room - len(f.pins)
	return f
}

func (m model) View() string {
	if !m.ready {
		return "  " + stText.Render(m.pixelGlyph()) + " " + stDim.Render("Starting trqsh…")
	}
	if m.width < 1 || m.height < 1 {
		return ""
	}
	var lines []string
	if m.setup.stage != "" {
		lines = m.setupLines()
	} else {
		f := m.frame()
		lines = append(lines, f.header...)
		if f.viewportRows > 0 {
			vp := m.vp
			vp.Height = f.viewportRows
			lines = append(lines, strings.Split(vp.View(), "\n")...)
		}
		if f.scrollHint {
			lines = append(lines, m.renderScrollHint())
		}
		lines = append(lines, f.pins...)
		lines = append(lines, f.loading...)
		lines = append(lines, f.menu...)
		lines = append(lines, f.prompt...)
		lines = append(lines, f.footer...)
	}
	for len(lines) < m.height {
		lines = append(lines, "")
	}
	for i := range lines {
		lines[i] = padCell(lines[i], m.width)
	}
	body := strings.Join(lines, "\n")
	if lipgloss.ColorProfile() == termenv.Ascii {
		return ansi.Strip(body)
	}
	page := lipgloss.NewStyle().Foreground(colBrand).Background(colPage)
	return page.Render(fillStyle(body, page))
}

func (m model) rule() string { return strings.Repeat("─", max(0, m.width)) }

func (m model) spread(left, right string) string {
	available := max(0, m.width-lipgloss.Width(left)-2)
	right = ansi.Truncate(right, available, "…")
	gap := max(1, m.width-lipgloss.Width(left)-lipgloss.Width(right)-1)
	return left + strings.Repeat(" ", gap) + right + " "
}

func (m model) renderHeader() string {
	left := stBrand.Render(" trqsh")
	if m.width >= 24 {
		left = " " + logoMark() + " " + stBrand.Render("trqsh")
	}
	if m.width >= 64 && m.opts.Version != "" {
		left += " " + stDim.Render(m.opts.Version)
	}
	glyph, word, col := m.connState()
	if m.loadingActive() && word != "error" {
		glyph = m.pixelGlyph()
		switch word {
		case "idle":
			word, col = "loading", colSecondary
		case "online":
			word = "working"
		}
	}
	right := boldFg(col, glyph+" "+strings.ToUpper(word))
	meta := stDim.Render(" · " + m.headerMeta())
	if lipgloss.Width(left)+lipgloss.Width(right)+lipgloss.Width(meta)+3 <= m.width {
		right += meta
	}
	return m.spread(left, right)
}

func (m model) connState() (glyph, word string, col lipgloss.TerminalColor) {
	if len(m.tunnels) == 0 {
		return "○", "idle", colDim
	}
	allFailed := true
	for _, t := range m.tunnels {
		if t.Status != "error" {
			allFailed = false
			break
		}
	}
	if allFailed {
		return "!", "error", colCritical
	}
	if m.status.Connected {
		return "●", "online", colGood
	}
	return "◌", "connecting", colWarning
}

func (m model) headerMeta() string {
	var parts []string
	if m.status.Edge != "" {
		parts = append(parts, m.status.Edge)
	}
	if m.status.Kind != "" {
		parts = append(parts, m.status.Kind)
	}
	parts = append(parts, plural(len(m.tunnels), "tunnel"))
	if m.remoteConnected {
		parts = append(parts, "paired")
	}
	return strings.Join(parts, " · ")
}

func plural(n int, noun string) string {
	if n == 1 {
		return "1 " + noun
	}
	return fmt.Sprintf("%d %ss", n, noun)
}

const pinnedRows = 4

func (m model) renderPinnedBlock(budget int) []string {
	if len(m.pins) == 0 || budget < 1 {
		return nil
	}
	const gap = "  "
	innerW := max(0, m.width-4)
	w := (innerW - (len(m.pins)-1)*len(gap)) / len(m.pins)
	if w >= 36 && budget >= 4 {
		rows := min(pinnedRows, budget-2)
		var boxes []string
		for i, name := range m.pins {
			if i > 0 {
				boxes = append(boxes, strings.TrimSuffix(strings.Repeat(gap+"\n", rows+2), "\n"))
			}
			boxes = append(boxes, m.pinBox(name, w, rows))
		}
		lines := strings.Split(lipgloss.JoinHorizontal(lipgloss.Top, boxes...), "\n")
		for i := range lines {
			lines[i] = "  " + lines[i]
		}
		return lines
	}
	// Compact summaries keep every pinned category visible without stacking
	// several six-line boxes. No pin is removed from the user's selection.
	var lines []string
	for _, name := range m.pins {
		if len(lines) >= budget {
			break
		}
		label := stTitle.Render(pad(strings.ToUpper(name), 9))
		lines = append(lines, "  "+label+" "+m.pinSummary(name, max(1, m.width-12)))
	}
	if len(lines) < len(m.pins) {
		lines[len(lines)-1] = "  " + stDim.Render(fmt.Sprintf("+ %d pinned panels", len(m.pins)-len(lines)+1))
	}
	return lines
}

func (m model) pinBox(name string, w, rows int) string {
	var title string
	var body []string
	switch name {
	case "tunnels":
		title = fmt.Sprintf("TUNNELS · %d", len(m.tunnels))
		body = m.tunnelsBody(w-4, rows)
	case "traffic":
		title = "TRAFFIC"
		body = m.trafficBody(w-4, rows)
	case "status":
		title = "SESSION"
		body = m.statusBody()
	}
	return panelBox(title, strings.Join(fitLines(body, rows, w-4), "\n"), w)
}

func (m model) pinSummary(name string, w int) string {
	switch name {
	case "tunnels":
		if len(m.tunnels) == 0 {
			return stDim.Render("No tunnels · /http 3000")
		}
		return stURL.Render(trunc(m.tunnels[0].PublicURL, w))
	case "traffic":
		if len(m.requests) == 0 {
			return stDim.Render("Waiting for requests…")
		}
		return requestLine(m.requests[len(m.requests)-1], w, true)
	case "status":
		glyph, word, col := m.connState()
		return boldFg(col, glyph+" "+strings.ToUpper(word)) + stDim.Render(" · "+m.headerMeta())
	}
	return ""
}

func (m model) tunnelsBody(w, rows int) []string {
	if len(m.tunnels) == 0 {
		return []string{stDim.Render("No active tunnels"), stKey.Render("/http 3000")}
	}
	limit := min(len(m.tunnels), max(1, rows/2))
	var out []string
	for _, t := range m.tunnels[:limit] {
		out = append(out, stURL.Render(trunc(t.PublicURL, w)))
		out = append(out, stDim.Render(trunc(fmt.Sprintf("→ %s · %d req", t.LocalAddr, t.Metrics.Requests), w)))
	}
	if len(m.tunnels) > limit {
		out = out[:min(len(out), rows-1)]
		out = append(out, stDim.Render(fmt.Sprintf("+ %d more · /ls", len(m.tunnels)-limit)))
	}
	return out
}

func (m model) trafficBody(w, rows int) []string {
	if len(m.requests) == 0 {
		return []string{stDim.Render("Waiting for requests…")}
	}
	var out []string
	if w >= 26 && rows >= 3 {
		out = append(out, stDim.Render(requestHeader(w, true)))
	}
	limit := max(0, rows-len(out))
	for _, r := range m.requests[max(0, len(m.requests)-limit):] {
		out = append(out, requestLine(r, w, true))
	}
	return out
}

// Fixed columns use terminal cell widths, including wide Unicode paths.
// The timestamp is optional so status and duration survive narrow layouts.
func requestHeader(w int, showTime bool) string {
	clock, pathW := requestWidths(w, showTime)
	prefix := ""
	if clock {
		prefix = "TIME     "
	}
	return prefix + pad("METHOD", 7) + " " + pad("PATH", pathW) + " " + pad("CODE", 5) + " " + leftPad("LATENCY", 7)
}

func requestWidths(w int, showTime bool) (clock bool, pathW int) {
	clock = showTime && w >= 70
	pathW = max(1, w-22)
	if clock {
		pathW -= 9
	}
	return clock, pathW
}

func requestLine(r reqRow, w int, showTime bool) string {
	code := fmt.Sprintf("%d", r.status)
	if r.status >= 400 {
		code = "! " + code
	}
	if w < 13 {
		return padCell(statusStyle(r.status).Render(code)+" "+stSub.Render(requestDuration(r.ms)), w)
	}
	if w < 26 {
		methodW, durationW := min(7, max(1, w/4)), min(7, max(5, w/4))
		pathW := w - methodW - durationW - 8
		path := ""
		if pathW > 0 {
			path = stText.Render(padCell(r.path, pathW)) + " "
		} else {
			methodW = max(1, w-durationW-7)
		}
		return methodStyle(r.method).Render(padCell(r.method, methodW)) + " " + path +
			statusStyle(r.status).Render(pad(code, 5)) + " " + stSub.Render(leftPad(requestDuration(r.ms), durationW))
	}
	clock, pathW := requestWidths(w, showTime)
	prefix := ""
	if clock {
		timestamp := "—"
		if !r.at.IsZero() {
			timestamp = r.at.Format("15:04:05")
		}
		prefix = stDim.Render(pad(timestamp, 8) + " ")
	}
	return prefix + methodStyle(r.method).Render(padCell(r.method, 7)) + " " + stText.Render(padCell(r.path, pathW)) + " " +
		statusStyle(r.status).Render(pad(code, 5)) + " " + stSub.Render(leftPad(requestDuration(r.ms), 7))
}

func requestDuration(ms int64) string {
	switch {
	case ms >= 60000:
		return fmt.Sprintf("%.1f m", float64(ms)/60000)
	case ms >= 1000:
		return fmt.Sprintf("%.1f s", float64(ms)/1000)
	default:
		return fmt.Sprintf("%d ms", ms)
	}
}

func leftPad(s string, w int) string {
	s = trunc(s, w)
	return strings.Repeat(" ", max(0, w-lipgloss.Width(s))) + s
}

func (m model) statusBody() []string {
	glyph, word, col := m.connState()
	return []string{
		boldFg(col, glyph+" "+strings.ToUpper(word)),
		stDim.Render("Edge       ") + stSub.Render(firstNonEmpty(m.status.Edge, "—")),
		stDim.Render("Transport  ") + stSub.Render(firstNonEmpty(m.status.Kind, "—")),
		stDim.Render("Tunnels    ") + stSub.Render(fmt.Sprint(len(m.tunnels))),
	}
}

// renderWelcome is the console's home screen: who you are, then a short list
// of what to do next that follows the state of things — share the dev server
// that's running, then copy, open and watch the tunnel once it's up. Small
// terminals get the three-line version.
func (m model) renderWelcome() []string {
	if m.height < 20 || m.width < 60 {
		return m.renderWelcomeCompact()
	}
	title := "Welcome to trqsh"
	account := stDim.Render("Not signed in · ") + stKey.Render("/login") + stDim.Render(" for reserved subdomains and custom domains")
	if m.acct != nil {
		title = "Welcome, " + firstNonEmpty(m.acct.User.Name, m.acct.User.Email, "you")
		account = stSub.Render(firstNonEmpty(m.acct.Plan, m.acct.Org.Plan, "free") + " plan")
		if m.acct.User.Email != "" {
			account += stDim.Render(" · " + m.acct.User.Email)
		}
	} else if m.authed {
		account = stSub.Render("Signed in")
	}
	lines := []string{
		"",
		"  " + logoMark() + "  " + stBrand.Render(title),
		"      " + account,
		"",
	}
	rows := m.quickStart()
	// Keep the list from crowding out the command it leads to: the header,
	// prompt and footer need about ten rows.
	rows = rows[:min(len(rows), max(2, m.height-10-len(lines)-2))]
	keyW := 0
	for _, r := range rows {
		keyW = max(keyW, lipgloss.Width(r[0]))
	}
	heading := "GET STARTED"
	if len(m.tunnels) > 0 {
		heading = "NEXT"
	}
	lines = append(lines, "  "+stTitle.Render(heading))
	for _, r := range rows {
		lines = append(lines, "  "+stKey.Render(pad(r[0], keyW))+"   "+stDim.Render(r[1]))
	}
	lines = append(lines, "")
	for i := range lines {
		lines[i] = ansi.Truncate(lines[i], max(1, m.width-2), "…")
	}
	return lines
}

// quickStart lists the home screen's suggestions as [keys, what it does].
func (m model) quickStart() [][2]string {
	var rows [][2]string
	if len(m.tunnels) == 0 {
		for _, p := range m.localPorts[:min(2, len(m.localPorts))] {
			rows = append(rows, [2]string{fmt.Sprintf("/http %d", p), fmt.Sprintf("Share the app running on :%d", p)})
		}
		rows = append(rows, [2]string{"3000 ⏎", "Share any local port — just type its number"})
	} else {
		host := strings.TrimPrefix(strings.TrimPrefix(m.tunnels[0].PublicURL, "https://"), "http://")
		rows = append(rows,
			[2]string{"Ctrl+Y", "Copy " + host},
			[2]string{"Ctrl+O", "Open it in your browser"},
			[2]string{"Ctrl+T", "Watch requests arrive live"},
		)
		if m.authed || m.acct != nil {
			rows = append(rows, [2]string{"/qr", "Control this console from your phone"})
		}
	}
	return append(rows,
		[2]string{"/", "Browse every command"},
		[2]string{"?", "Keyboard shortcuts"},
	)
}

func (m model) renderWelcomeCompact() []string {
	title := "Your tunnel workspace"
	accountLine := stDim.Render("Not signed in · ") + stKey.Render("/login")
	if m.acct != nil {
		title = "Welcome, " + firstNonEmpty(m.acct.User.Name, m.acct.User.Email, "you")
		accountLine = stSub.Render(firstNonEmpty(m.acct.Plan, m.acct.Org.Plan, "free") + " plan")
		if m.acct.User.Email != "" {
			accountLine += stDim.Render(" · " + m.acct.User.Email)
		}
	} else if m.authed {
		accountLine = stSub.Render("Signed in")
	}
	// Point at a dev server that's actually running, when one was found.
	port, what := "3000", " to share localhost"
	if len(m.localPorts) > 0 && len(m.tunnels) == 0 {
		port = fmt.Sprint(m.localPorts[0])
		what = " — something is running on :" + port
	}
	action := stKey.Render("/http "+port) + stDim.Render(what+" · ") + stKey.Render("/") + stDim.Render(" for commands")
	if m.width < 60 {
		action = stKey.Render("/http "+port) + stDim.Render(" · ") + stKey.Render("/") + stDim.Render(" commands")
	}
	lines := []string{"  " + stBrand.Render(title), "  " + accountLine, "  " + action}
	if m.height >= 14 {
		lines = append([]string{""}, append(lines, "")...)
	}
	for i := range lines {
		lines[i] = ansi.Truncate(lines[i], max(1, m.width-2), "…")
	}
	return lines
}

func (m *model) refreshWelcome() {
	if !m.welcomeShown || m.welcomeLen == 0 || len(m.transcript) < m.welcomeLen {
		return
	}
	fresh := m.renderWelcome()
	m.transcript = append(fresh, m.transcript[m.welcomeLen:]...)
	m.welcomeLen = len(fresh)
}

func padCell(s string, w int) string {
	if w <= 0 {
		return ""
	}
	if lipgloss.Width(s) > w {
		s = ansi.Truncate(s, w, "…")
	}
	return s + strings.Repeat(" ", w-lipgloss.Width(s))
}

func (m model) renderInputBox(divider bool) string {
	ta := m.input
	if m.selectAll {
		ta.FocusedStyle.Text = stMenuSel
		ta.FocusedStyle.Placeholder = stMenuSel
		ta.Focus()
	}
	lines := strings.Split(ta.View(), "\n")
	for i := range lines {
		lines[i] = " " + lines[i]
	}
	body := strings.Join(lines, "\n")
	if divider {
		return inputBox(body, m.width)
	}
	return body
}

func (m model) renderScrollHint() string {
	if m.vp.AtBottom() {
		return ""
	}
	text := "↓ More output below · End to follow latest · PgDn to scroll"
	if m.width < 64 {
		text = "↓ More below · End to follow latest"
	}
	return "  " + stDim.Render(text)
}

// renderHint is the footer: the keys that matter right now on the left and,
// once a tunnel is up, its address on the right — the one thing people come
// back to the console for. A flash message briefly takes the hints' place.
func (m model) renderHint() string {
	var variants [][]string
	modal := true
	switch {
	case m.showKeys:
		variants = [][]string{{"Esc", "close"}}
	case m.confirm != nil:
		variants = [][]string{{"Y", "confirm", "N", "cancel", "←→", "choose", "Enter", "select"}, {"Y", "confirm", "N", "cancel"}, {"Y/N", ""}}
	case m.menuOpen():
		variants = [][]string{{"↑↓", "select", "Tab", "complete", "Enter", "run", "Esc", "close"}, {"↑↓", "select", "Enter", "run", "Esc", "close"}, {"Enter", "run", "Esc", "close"}, {"Esc", "close"}}
	case m.input.Value() != "":
		variants = [][]string{{"Enter", "run", "Esc", "clear", "↑↓", "history"}, {"Enter", "run", "Esc", "clear"}, {"Enter", "run"}}
	default:
		modal = false
		variants = [][]string{{"/", "commands", "?", "shortcuts", "↑↓", "history", "Ctrl+C", "quit"}, {"/", "commands", "?", "shortcuts"}, {"/", "commands"}}
	}
	right := ""
	if !modal && m.flash == "" && !slices.Contains(m.pins, "tunnels") {
		right = m.tunnelStatus(max(0, m.width-4))
	}
	avail := m.width - 2
	if right != "" {
		avail -= lipgloss.Width(right) + 3
	}
	left := ""
	if m.flash != "" {
		left = stText.Render(trunc(m.flash, max(1, m.width-4)))
	} else {
		for _, v := range variants {
			if text := keyHints(v...); lipgloss.Width(text) <= avail {
				left = text
				break
			}
		}
	}
	if left == "" && right == "" {
		return ""
	}
	gap := max(1, m.width-2-lipgloss.Width(left)-lipgloss.Width(right)-1)
	return "  " + left + strings.Repeat(" ", gap) + right
}

// tunnelStatus is the footer's live line for the running tunnels, dropping
// detail until it fits w cells: "● tidy-otter.trqsh.uz → :3000 · 42 req +1".
// The dot brightens while requests are arriving, like an activity light.
func (m model) tunnelStatus(w int) string {
	if len(m.tunnels) == 0 || w < 12 {
		return ""
	}
	t := m.tunnels[0]
	dot := stSub.Render("●")
	switch {
	case t.Status == "error":
		dot = stErr.Render("!")
	case !m.status.Connected:
		dot = stWarn.Render("◌")
	case !m.lastReqAt.IsZero() && time.Since(m.lastReqAt) < 2*time.Second:
		dot = stBrand.Render("●")
	}
	host := strings.TrimPrefix(strings.TrimPrefix(t.PublicURL, "https://"), "http://")
	local := strings.TrimPrefix(t.LocalAddr, "localhost")
	more := ""
	if n := len(m.tunnels) - 1; n > 0 {
		more = fmt.Sprintf(" +%d", n)
	}
	for _, parts := range [][]string{
		{host, " → " + local, fmt.Sprintf(" · %d req", t.Metrics.Requests), more},
		{host, " → " + local, more},
		{host, more},
		{host},
	} {
		text := dot + " " + stURL.Render(parts[0]) + stDim.Render(strings.Join(parts[1:], ""))
		if lipgloss.Width(text) <= w {
			return text
		}
	}
	return dot + " " + stURL.Render(trunc(host, w-2))
}

func (m model) renderMenu(budget int) []string {
	if !m.menuOpen() || budget < 1 {
		return nil
	}
	var out []string
	if budget >= 3 {
		title := "COMMANDS"
		if strings.Contains(strings.TrimSpace(m.input.Value()), " ") || strings.HasSuffix(m.input.Value(), " ") {
			title = "CHOOSE"
		}
		out = append(out, "  "+stTitle.Render(title)+stDim.Render(fmt.Sprintf("  %d/%d", m.menuIdx+1, len(m.menuItems))))
	}
	window := min(7, budget-len(out))
	start := max(0, m.menuIdx-window+1)
	end := min(start+window, len(m.menuItems))
	innerW := max(1, m.width-4)
	labelW := 0
	for _, e := range m.menuItems {
		labelW = max(labelW, lipgloss.Width(e.label))
	}
	labelW = min(labelW, min(26, max(1, innerW-2)))
	for i := start; i < end; i++ {
		e := m.menuItems[i]
		label := padCell(e.label, labelW)
		desc := ""
		if m.width >= 60 && e.desc != "" {
			desc = "  " + trunc(e.desc, max(1, innerW-labelW-4))
		}
		if i == m.menuIdx {
			out = append(out, "  "+stMenuSel.Render(padCell("› "+label+desc, innerW)))
		} else {
			// The command reads bold; a usage hint after it ("<port>") stays
			// quiet, while a concrete choice ("/stop a1b2c3d4") stays bold.
			name, rest, found := strings.Cut(label, " ")
			restStyle := stKey
			if r := strings.TrimSpace(rest); strings.HasPrefix(r, "<") || strings.HasPrefix(r, "[") || r == "" {
				restStyle = stDim
			}
			if found {
				rest = " " + rest
			}
			out = append(out, "    "+stKey.Render(name)+restStyle.Render(rest)+stDim.Render(desc))
		}
	}
	return out
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

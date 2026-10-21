package tui

// This file is the slash-command registry — the "strong logic" behind the
// console. Each command has a name, an argument hint (shown in the autocomplete
// menu and used to decide whether Enter runs it or completes it), a one-line
// description, and a handler. Handlers get *model so they can print to the
// transcript synchronously and/or return a tea.Cmd for async work (API calls).

import (
	"bytes"
	"context"
	"fmt"
	"net"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/atotto/clipboard"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/mdp/qrterminal/v3"
	"github.com/trqsh-uz/trqsh/internal/agent"
)

type slashCmd struct {
	name string
	args string // usage hint; non-empty means "takes arguments"
	desc string
	run  func(m *model, args []string) tea.Cmd
}

// slashCommands is the ordered command list (also the order shown in /help and
// the autocomplete menu). It's populated in init rather than as a static
// initializer because cmdHelp reads it back, which the compiler would otherwise
// flag as an initialization cycle.
var slashCommands []slashCmd

func init() {
	slashCommands = []slashCmd{
		{"http", "<port>", "Expose a local HTTP port", cmdHTTP},
		{"tcp", "<port>", "Expose a local TCP port", cmdTCP},
		{"udp", "<port>", "Expose a local UDP port", cmdUDP},
		{"start", "", "Start tunnels from your config", cmdStart},
		{"ls", "", "List running tunnels", cmdLs},
		{"open", "<id>", "Open a tunnel URL in your browser", cmdOpen},
		{"qr", "[id|stop]", "Pair this console to your phone (or a tunnel's QR)", cmdQR},
		{"copy", "[id]", "Copy a tunnel URL to the clipboard", cmdCopy},
		{"stop", "<id|all>", "Stop a tunnel (or all)", cmdStop},
		{"down", "", "Stop the background daemon and quit", cmdDown},
		{"requests", "", "Show recently captured requests", cmdRequests},
		{"pin", "<panel>", "Keep a live panel on screen (traffic/tunnels/status)", cmdPin},
		{"unpin", "<panel>", "Remove a pinned panel", cmdUnpin},
		{"theme", "[auto|dark|light]", "Switch the console theme", cmdTheme},
		{"status", "", "Show connection status", cmdStatus},
		{"whoami", "", "Show account, plan and usage", cmdWhoami},
		{"login", "[key]", "Sign in via browser (or paste a key)", cmdLogin},
		{"setup", "", "Open the welcome and sign-in guide", cmdSetup},
		{"logout", "", "Sign out", cmdLogout},
		{"subdomains", "[reserve|release]", "Manage reserved subdomains", cmdSubdomains},
		{"domains", "[add|verify]", "Manage custom domains", cmdDomains},
		{"config", "", "Show configuration", cmdConfig},
		{"update", "[check]", "Check for / install a newer trqsh", cmdUpdate},
		{"uninstall", "", "Remove trqsh's local data", cmdUninstall},
		{"version", "", "Show version", cmdVersion},
		{"clear", "", "Clear the transcript", cmdClear},
		{"help", "", "Show all commands", cmdHelp},
		{"quit", "", "Exit the console", cmdQuit},
	}

}

// commandAliases maps alternate names (and words people reach for first) to
// the command they mean. The menu matches them too, so typing "/kill" offers
// /stop.
var commandAliases = map[string]string{
	"q": "quit", "exit": "quit",
	"list": "ls", "ps": "ls", "tunnels": "ls",
	"account": "whoami", "me": "whoami",
	"subs": "subdomains", "subdomain": "subdomains",
	"domain": "domains",
	"?":      "help", "h": "help",
	"kill": "stop", "close": "stop",
	"share": "http", "expose": "http",
	"signin": "login", "signout": "logout",
	"cls":     "clear",
	"upgrade": "update",
	"traffic": "requests", "reqs": "requests",
	"shutdown": "down",
}

// lookupCommand resolves a name (or a short alias) to a command.
func lookupCommand(name string) (slashCmd, bool) {
	for _, c := range slashCommands {
		if c.name == name {
			return c, true
		}
	}
	if target, ok := commandAliases[name]; ok {
		return lookupCommand(target)
	}
	return slashCmd{}, false
}

// aliasMatches reports whether one of cmd's aliases starts with prefix.
func aliasMatches(cmd, prefix string) bool {
	for alias, target := range commandAliases {
		if target == cmd && len(alias) > 1 && strings.HasPrefix(alias, prefix) {
			return true
		}
	}
	return false
}

// suggestCommand returns the command a mistyped name most likely meant
// ("stp" → "stop", "unistall" → "uninstall"), or "" when nothing is close.
// A command the name is the start of wins outright ("stat" → "status").
func suggestCommand(name string) string {
	if name == "" {
		return ""
	}
	for _, c := range slashCommands {
		if strings.HasPrefix(c.name, name) {
			return c.name
		}
	}
	best, bestDist := "", 3
	if len(name) <= 3 {
		bestDist = 2 // short names: a two-letter edit is a different word
	}
	consider := func(candidate, target string) {
		if d := editDistance(name, candidate); d < bestDist {
			best, bestDist = target, d
		}
	}
	for _, c := range slashCommands {
		consider(c.name, c.name)
	}
	for alias, target := range commandAliases {
		if len(alias) > 2 {
			consider(alias, target)
		}
	}
	return best
}

// editDistance is the optimal-string-alignment distance between a and b:
// Levenshtein plus adjacent swaps as one edit ("hlep" is one away from
// "help"). Byte-wise, which is fine for ASCII command names.
func editDistance(a, b string) int {
	d := make([][]int, len(a)+1)
	for i := range d {
		d[i] = make([]int, len(b)+1)
		d[i][0] = i
	}
	for j := range d[0] {
		d[0][j] = j
	}
	for i := 1; i <= len(a); i++ {
		for j := 1; j <= len(b); j++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			d[i][j] = min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+cost)
			if i > 1 && j > 1 && a[i-1] == b[j-2] && a[i-2] == b[j-1] {
				d[i][j] = min(d[i][j], d[i-2][j-2]+1)
			}
		}
	}
	return d[len(a)][len(b)]
}

// parseLine splits "/http 3000 --subdomain x" into ("http", ["3000","--subdomain","x"]).
func parseLine(line string) (string, []string) {
	fields := strings.Fields(strings.TrimPrefix(strings.TrimSpace(line), "/"))
	if len(fields) == 0 {
		return "", nil
	}
	return strings.ToLower(fields[0]), fields[1:]
}

// --- tunnel commands ---

func cmdHTTP(m *model, a []string) tea.Cmd { return startTunnelCmd(m, "http", a) }
func cmdTCP(m *model, a []string) tea.Cmd  { return startTunnelCmd(m, "tcp", a) }
func cmdUDP(m *model, a []string) tea.Cmd  { return startTunnelCmd(m, "udp", a) }

func startTunnelCmd(m *model, proto string, args []string) tea.Cmd {
	if len(args) == 0 {
		m.appendLines(stErr.Render("  ✗ which port? ") + stDim.Render("e.g. ") + stKey.Render("/"+proto+" 3000"))
		return nil
	}
	spec := agent.TunnelSpec{Proto: proto, Addr: normalizeAddr(args[0])}
	for i := 1; i < len(args); i++ { // a couple of familiar flags
		switch args[i] {
		case "--subdomain", "-s":
			if i+1 < len(args) {
				spec.Subdomain = args[i+1]
				i++
			}
		case "--remote-port":
			if i+1 < len(args) {
				spec.RemotePort, _ = strconv.Atoi(args[i+1])
				i++
			}
		}
	}
	m.appendLines(stDim.Render("  starting " + proto + " tunnel → " + spec.Addr + " …"))
	cl, width := m.cl, m.width
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		t, err := cl.startTunnel(ctx, spec)
		if err != nil {
			return printMsg{[]string{stErr.Render("  ✗ " + err.Error())}}
		}
		// The URL is what you came for, so it goes straight to the clipboard
		// (the line says so). A headless box without a clipboard just skips it.
		copied := clipboard.WriteAll(t.PublicURL) == nil
		// Starting a tunnel never needs the local service up, but a visitor
		// would get an error page — say so now rather than leave it a mystery.
		answering := proto == "udp" || localAnswers(spec.Addr)
		return printMsg{tunnelOnlineLines(proto, &t, width, copied, answering)}
	}
}

// tunnelOnlineLines is the result of starting a tunnel: the URL in a card, a
// warning when nothing is listening locally yet, and the next keys to press.
func tunnelOnlineLines(proto string, t *agent.Tunnel, width int, copied, answering bool) []string {
	status := stOK.Render("  ✓ " + strings.ToUpper(proto) + " tunnel online")
	if copied {
		status += stDim.Render(" · URL copied to the clipboard")
	}
	body := []string{stURL.Render(t.PublicURL), stDim.Render("→ " + t.LocalAddr)}
	out := append([]string{"", status}, card("", body, cardWidth(width, lipgloss.Width(t.PublicURL)))...)
	if !answering {
		out = append(out, stWarn.Render("  ! nothing is answering on "+t.LocalAddr+" yet")+
			stDim.Render(" — visitors see an error until it starts"))
	}
	hints := []string{"Ctrl+O", "open", "Ctrl+T", "live traffic", "/qr", "phone"}
	if proto != "http" {
		hints = []string{"Ctrl+Y", "copy address", "/ls", "all tunnels"}
	}
	return append(out, "  "+keyHints(hints...))
}

// localAnswers reports whether something accepts connections at addr.
func localAnswers(addr string) bool {
	c, err := net.DialTimeout("tcp", addr, 400*time.Millisecond)
	if err != nil {
		return false
	}
	_ = c.Close()
	return true
}

func cmdLs(m *model, _ []string) tea.Cmd {
	if len(m.tunnels) == 0 {
		m.appendLines(stDim.Render("  no tunnels yet — type a port, like ") + stKey.Render("3000") + stDim.Render(", to share it"))
		return nil
	}
	urlW, localW := 0, 0
	for _, t := range m.tunnels {
		urlW, localW = max(urlW, lipgloss.Width(t.PublicURL)), max(localW, lipgloss.Width(t.LocalAddr))
	}
	// Columns shrink the URL last: it's the part people copy.
	urlW = min(urlW, max(12, m.width-localW-36))
	m.appendLines("  " + stTitle.Render("TUNNELS") + stDim.Render(fmt.Sprintf("  %d running", len(m.tunnels))))
	m.appendLines("  " + stDim.Render(pad("ID", 10)+pad("URL", urlW+2)+pad("LOCAL", localW+2)+pad("STATUS", 10)+"REQUESTS"))
	for _, t := range m.tunnels {
		state := stOK.Render(pad("● "+t.Status, 10))
		if t.Status == "error" {
			state = stErr.Render(pad("! "+t.Status, 10))
		}
		m.appendLines("  " + stKey.Render(pad(shortID(t.ID), 10)) + stURL.Render(padCell(t.PublicURL, urlW)) + "  " +
			stSub.Render(pad(t.LocalAddr, localW+2)) + state + stSub.Render(strconv.FormatInt(t.Metrics.Requests, 10)))
	}
	m.appendLines("  " + keyHints("/stop <id>", "stop one", "/open <id>", "open", "/qr <id>", "QR code"))
	return nil
}

func cmdOpen(m *model, args []string) tea.Cmd {
	t := m.pickTunnel(args)
	if t == nil {
		m.appendLines(stErr.Render("  ✗ no matching tunnel"))
		return nil
	}
	if err := openBrowser(t.PublicURL); err != nil {
		m.appendLines(stErr.Render("  ✗ couldn't open browser: " + err.Error()))
		return nil
	}
	m.appendLines(stOK.Render("  ✓ opened ") + stURL.Render(t.PublicURL))
	return nil
}

// cmdQR is dual-purpose, dispatching on its argument: bare "/qr" pairs this
// console to a phone (remote control — see cmdQRPair), "/qr stop" ends an
// active pairing, and "/qr <id>" keeps the original behavior of showing a
// tunnel URL's QR code.
func cmdQR(m *model, args []string) tea.Cmd {
	switch {
	case len(args) == 0:
		return cmdQRPair(m)
	case strings.EqualFold(args[0], "stop"):
		return cmdQRStop(m)
	default:
		return cmdQRTunnel(m, args)
	}
}

func cmdQRTunnel(m *model, args []string) tea.Cmd {
	t := m.pickTunnel(args)
	if t == nil {
		m.appendLines(stErr.Render("  ✗ no tunnel to show — ") + stKey.Render("/http <port>") + stDim.Render(" first"))
		return nil
	}
	var buf bytes.Buffer
	qrterminal.GenerateHalfBlock(t.PublicURL, qrterminal.L, &buf)
	m.appendLines(stDim.Render("  scan to open ") + stURL.Render(t.PublicURL) + stDim.Render(" on your phone:"))
	for line := range strings.SplitSeq(strings.TrimRight(buf.String(), "\n"), "\n") {
		m.appendLines("  " + line)
	}
	return nil
}

// cmdQRPair starts a /qr remote-control pairing: the daemon signs into the
// control plane and opens a session (internal/api/remote.go), and this
// prints a QR + short code for a phone to scan or type in at qr.<base>.
func cmdQRPair(m *model) tea.Cmd {
	if m.acct == nil && !m.authed {
		m.appendLines(stErr.Render("  ✗ sign in first — ") + stKey.Render("/login"))
		return nil
	}
	m.appendLines(stDim.Render("  starting a pairing session…"))
	cl := m.cl
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		r, err := cl.remoteStart(ctx)
		if err != nil {
			return printMsg{[]string{stErr.Render("  ✗ " + err.Error())}}
		}
		return remoteStartedMsg{code: r.Code, url: r.URL}
	}
}

func cmdQRStop(m *model) tea.Cmd {
	if m.remoteCode == "" {
		m.appendLines(stDim.Render("  no active pairing"))
		return nil
	}
	m.appendLines(stDim.Render("  ending pairing…"))
	cl := m.cl
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()
		_ = cl.remoteStop(ctx)
		return printMsg{[]string{stOK.Render("  ✓ pairing ended")}}
	}
}

// renderPairQR renders the pairing QR (reusing the same half-block QR the
// tunnel-URL /qr uses) plus a typable fallback: the code alone, for
// qr.<base>'s bare landing page when scanning isn't an option.
func renderPairQR(m *model, url, code string) {
	var buf bytes.Buffer
	qrterminal.GenerateHalfBlock(url, qrterminal.L, &buf)
	m.appendLines(stDim.Render("  scan to control this console from your phone:"))
	for line := range strings.SplitSeq(strings.TrimRight(buf.String(), "\n"), "\n") {
		m.appendLines("  " + line)
	}
	m.appendLines(
		stDim.Render("  or open ")+stURL.Render("qr."+m.opts.BaseDomain)+stDim.Render(" and enter ")+stKey.Render(code),
		stDim.Render("  ")+stKey.Render("/qr stop")+stDim.Render(" ends the pairing"),
	)
}

// remoteBlocked lists commands a paired phone can never run, even though
// everything else executes exactly like locally typed input (see run() in
// model.go): process lifecycle (down, quit) so a phone can't pull the rug
// out from under whoever's at the laptop, account credentials (login,
// logout), anything touching the running binary or local data (update,
// uninstall), and pairing management itself (qr) so a phone can't end or
// replace its own session.
var remoteBlocked = map[string]bool{
	"qr": true, "login": true, "logout": true, "setup": true,
	"uninstall": true, "update": true, "down": true, "quit": true,
}

func cmdCopy(m *model, args []string) tea.Cmd {
	t := m.pickTunnel(args)
	if t == nil {
		m.appendLines(stErr.Render("  ✗ no tunnel to copy"))
		return nil
	}
	if err := clipboard.WriteAll(t.PublicURL); err != nil {
		m.appendLines(stErr.Render("  ✗ couldn't copy: " + err.Error()))
		return nil
	}
	m.appendLines(stOK.Render("  ✓ copied ") + stURL.Render(t.PublicURL) + stDim.Render(" to the clipboard"))
	return nil
}

func cmdRequests(m *model, _ []string) tea.Cmd {
	w := max(1, m.width-4)
	cl := m.cl
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()
		reqs, err := cl.requests(ctx)
		if err != nil {
			return printMsg{[]string{stErr.Render("  ✗ " + err.Error())}}
		}
		if len(reqs) == 0 {
			return printMsg{[]string{stDim.Render("  no requests captured yet — expose an HTTP service with /http")}}
		}
		out := []string{"  " + stTitle.Render("RECENT REQUESTS")}
		if w >= 26 {
			out = append(out, "  "+stDim.Render(requestHeader(w, false)))
		}
		for _, r := range reqs[max(0, len(reqs)-20):] {
			out = append(out, "  "+requestLine(reqRow{
				method: r.Method, path: r.Host + r.Path, status: r.Status, ms: r.DurationMs,
			}, w, false))
		}
		return printMsg{out}
	}
}

func cmdStop(m *model, args []string) tea.Cmd {
	if len(m.tunnels) == 0 {
		m.appendLines(stDim.Render("  no tunnels running"))
		return nil
	}
	if len(args) == 0 {
		m.appendLines(stErr.Render("  ✗ which tunnel? ") + stKey.Render("/stop <id|all>") + stDim.Render(" — or type ") + stKey.Render("/stop ") + stDim.Render("and pick one"))
		return nil
	}
	target := args[0]
	tunnels := append([]agent.Tunnel(nil), m.tunnels...) // snapshot for the goroutine
	var victims []agent.Tunnel
	if strings.EqualFold(target, "all") {
		victims = tunnels
	} else if t := matchTunnel(tunnels, target); t != nil {
		victims = []agent.Tunnel{*t}
	}
	if len(victims) == 0 {
		m.appendLines(stErr.Render("  ✗ no tunnel matched " + target))
		return nil
	}
	run := func(m *model) tea.Cmd {
		cl := m.cl
		return func() tea.Msg {
			ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
			defer cancel()
			var out []string
			for _, t := range victims {
				if err := cl.stopTunnel(ctx, t.ID); err != nil {
					out = append(out, stErr.Render("  ✗ "+err.Error()))
				} else {
					out = append(out, stOK.Render("  ✓ stopped ")+stDim.Render(t.PublicURL))
				}
			}
			return printMsg{out}
		}
	}
	if len(victims) < 2 || (len(args) > 1 && confirmWord(args[1])) {
		return run(m)
	}
	detail := make([]string, 0, len(victims))
	for _, t := range victims {
		detail = append(detail, t.PublicURL+"  → "+t.LocalAddr)
	}
	return m.ask(confirmState{
		title:  "Stop all " + plural(len(victims), "tunnel") + "?",
		detail: detail,
		yes:    "Stop all", onYes: run, onYesID: "stop",
	})
}

// --- pins ---

var pinnable = map[string]bool{"traffic": true, "tunnels": true, "status": true}

func cmdPin(m *model, args []string) tea.Cmd {
	if len(args) == 0 {
		m.appendLines(stErr.Render("  ✗ usage: ") + stKey.Render("/pin <traffic|tunnels|status>"))
		return nil
	}
	name := strings.ToLower(args[0])
	if !pinnable[name] {
		m.appendLines(stErr.Render("  ✗ can't pin ") + name + stDim.Render(" — try traffic, tunnels or status"))
		return nil
	}
	if slices.Contains(m.pins, name) {
		m.appendLines(stDim.Render("  " + name + " is already pinned"))
		return nil
	}
	m.pins = append(m.pins, name)
	m.appendLines(stOK.Render("  ✓ pinned ") + stKey.Render(name) + stDim.Render(" — it stays on screen"))
	return nil
}

func cmdUnpin(m *model, args []string) tea.Cmd {
	if len(args) == 0 {
		m.appendLines(stErr.Render("  ✗ usage: ") + stKey.Render("/unpin <name|all>"))
		return nil
	}
	if strings.EqualFold(args[0], "all") {
		m.pins = nil
		m.appendLines(stOK.Render("  ✓ unpinned all"))
		return nil
	}
	name := strings.ToLower(args[0])
	kept := m.pins[:0]
	found := false
	for _, p := range m.pins {
		if p == name {
			found = true
			continue
		}
		kept = append(kept, p)
	}
	m.pins = kept
	if found {
		m.appendLines(stOK.Render("  ✓ unpinned " + name))
	} else {
		m.appendLines(stErr.Render("  ✗ " + name + " isn't pinned"))
	}
	return nil
}

// --- account / status / info ---

func cmdStatus(m *model, _ []string) tea.Cmd {
	glyph, word, col := m.connState()
	m.appendLines(
		"  "+boldFg(col, glyph+" "+strings.ToUpper(word)),
		"  "+stDim.Render(pad("Edge", 11))+stSub.Render(firstNonEmpty(m.status.Edge, "—")),
		"  "+stDim.Render(pad("Transport", 11))+stSub.Render(firstNonEmpty(m.status.Kind, "—")),
		"  "+stDim.Render(pad("Tunnels", 11))+stSub.Render(strconv.Itoa(len(m.tunnels))),
	)
	return nil
}

func cmdWhoami(m *model, _ []string) tea.Cmd {
	if m.acct == nil {
		m.appendLines(stDim.Render("  not signed in — ") + stKey.Render("/login"))
		return m.fetchAccount()
	}
	a := m.acct
	m.appendLines(
		"  "+stBrand.Render(firstNonEmpty(a.User.Name, a.User.Email, "—"))+stDim.Render("  ·  "+firstNonEmpty(a.Plan, a.Org.Plan, "free")+" plan"),
		"  "+stDim.Render(pad("Email", 11))+stSub.Render(firstNonEmpty(a.User.Email, "—")),
		"  "+stDim.Render(pad("Traffic", 11))+stSub.Render(humanBytes(a.Usage.BytesIn)+" in · "+humanBytes(a.Usage.BytesOut)+" out")+stDim.Render("  last 30 days"),
		"  "+stDim.Render(pad("Requests", 11))+stSub.Render(strconv.FormatInt(a.Usage.Requests, 10))+stDim.Render("  last 30 days"),
	)
	return nil
}

func cmdLogin(m *model, args []string) tea.Cmd {
	if len(args) > 0 { // paste an API key directly
		key := args[0]
		cl := m.cl
		m.appendLines(stDim.Render("  signing in with key…"))
		return func() tea.Msg {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			if err := cl.login(ctx, key); err != nil {
				return printMsg{[]string{stErr.Render("  ✗ sign-in failed: " + err.Error())}}
			}
			return loginDoneMsg{ok: true}
		}
	}
	if m.loginActive {
		m.appendLines(stDim.Render("  sign-in already in progress…"))
		return nil
	}
	cl := m.cl
	m.appendLines(stDim.Render("  starting browser sign-in…"))
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		d, err := cl.oauthStart(ctx)
		if err != nil {
			return printMsg{[]string{stErr.Render("  ✗ couldn't start sign-in: " + err.Error())}}
		}
		return loginStartedMsg{d: d}
	}
}

func cmdUpdate(m *model, args []string) tea.Cmd {
	checkOnly := len(args) > 0 && strings.EqualFold(args[0], "check")
	cur, onCheck, onUpdate := m.opts.Version, m.opts.OnCheckUpdate, m.opts.OnUpdate
	m.appendLines(stDim.Render("  checking for updates…"))
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
		defer cancel()
		var latest string
		var err error
		if onCheck != nil {
			latest, err = onCheck(ctx)
		}
		switch {
		case err != nil:
			return printMsg{[]string{stErr.Render("  ✗ couldn't check: " + err.Error())}}
		case latest == "":
			return printMsg{[]string{stDim.Render("  no release info available")}}
		case cur == "dev" || cur == "":
			return printMsg{[]string{stDim.Render("  dev build; latest release is " + latest)}}
		case latest == cur:
			return printMsg{[]string{stOK.Render("  ✓ trqsh " + cur + " is up to date")}}
		}
		if checkOnly || onUpdate == nil {
			return printMsg{[]string{
				stWarn.Render("  ▲ update available: ") + stKey.Render(cur+" → "+latest),
				stDim.Render("  run ") + stKey.Render("/update") + stDim.Render(" to install it"),
			}}
		}
		summary, err := onUpdate(ctx)
		if err != nil {
			return printMsg{[]string{stErr.Render("  ✗ update failed: " + err.Error())}}
		}
		return printMsg{[]string{stOK.Render("  ✓ " + summary), stDim.Render("  restart the console to run the new version")}}
	}
}

func cmdStart(m *model, _ []string) tea.Cmd {
	specs := m.opts.StartSpecs
	if len(specs) == 0 {
		m.appendLines(stDim.Render("  no tunnels in your config — add some, or use ") + stKey.Render("/http <port>"))
		return nil
	}
	cl := m.cl
	m.appendLines(stDim.Render(fmt.Sprintf("  starting %d tunnel(s) from config…", len(specs))))
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
		defer cancel()
		var out []string
		for _, spec := range specs {
			t, err := cl.startTunnel(ctx, spec)
			if err != nil {
				out = append(out, stErr.Render("  ✗ "+firstNonEmpty(spec.Name, spec.Addr)+": "+err.Error()))
			} else {
				out = append(out, stOK.Render("  ✓ ")+stURL.Render(t.PublicURL)+stDim.Render("  → "+t.LocalAddr))
			}
		}
		return printMsg{out}
	}
}

func cmdDown(m *model, args []string) tea.Cmd {
	run := func(m *model) tea.Cmd {
		cl := m.cl
		m.appendLines(stDim.Render("  stopping the background daemon…"))
		// Stop the daemon, then quit — there's nothing left to show once it's gone.
		return tea.Sequence(
			func() tea.Msg {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				_ = cl.shutdown(ctx)
				return nil
			},
			tea.Quit,
		)
	}
	// Nothing would be lost: skip the question.
	if len(m.tunnels) == 0 || (len(args) > 0 && confirmWord(args[0])) {
		return run(m)
	}
	return m.ask(confirmState{
		title:  "Stop the daemon and quit?",
		detail: []string{plural(len(m.tunnels), "running tunnel") + " will go offline."},
		yes:    "Stop & quit", onYes: run, onYesID: "down",
	})
}

func cmdLogout(m *model, args []string) tea.Cmd {
	run := func(m *model) tea.Cmd {
		cl := m.cl
		// Forget the startup key too, or the next fetchAccount (e.g. /whoami)
		// would silently sign that account back in.
		m.acct, m.authed, m.opts.APIKey = nil, false, ""
		m.refreshWelcome()
		return func() tea.Msg {
			ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
			defer cancel()
			if err := cl.logout(ctx); err != nil {
				return printMsg{[]string{stErr.Render("  ✗ " + err.Error())}}
			}
			return printMsg{[]string{stOK.Render("  ✓ signed out")}}
		}
	}
	if (!m.authed && m.acct == nil) || (len(args) > 0 && confirmWord(args[0])) {
		return run(m)
	}
	who := "this account"
	if m.acct != nil {
		who = firstNonEmpty(m.acct.User.Email, m.acct.User.Name, who)
	}
	return m.ask(confirmState{
		title:  "Sign out of " + who + "?",
		detail: []string{"Reserved subdomains and custom domains need sign-in to use."},
		yes:    "Sign out", onYes: run, onYesID: "logout",
	})
}

func cmdConfig(m *model, _ []string) tea.Cmd {
	if len(m.opts.ConfigRows) == 0 {
		m.appendLines(stDim.Render("  (no configuration to show)"))
		return nil
	}
	m.appendLines("  " + stTitle.Render("CONFIG"))
	for _, r := range m.opts.ConfigRows {
		m.appendLines("  " + stDim.Render(pad(r[0], 12)) + r[1])
	}
	return nil
}

func cmdSubdomains(m *model, args []string) tea.Cmd {
	cl, base := m.cl, firstNonEmpty(m.opts.BaseDomain, "trqsh.uz")
	if len(args) >= 2 {
		switch strings.ToLower(args[0]) {
		case "reserve", "add":
			name := strings.ToLower(args[1])
			return func() tea.Msg {
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				defer cancel()
				s, err := cl.reserveSubdomain(ctx, name)
				if err != nil {
					return printMsg{[]string{stErr.Render("  ✗ " + err.Error())}}
				}
				return printMsg{[]string{stOK.Render("  ✓ reserved ") + stURL.Render(s.Subdomain+"."+base)}}
			}
		case "release", "remove", "rm":
			name := args[1]
			return func() tea.Msg {
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				defer cancel()
				subs, err := cl.listSubdomains(ctx)
				if err != nil {
					return printMsg{[]string{stErr.Render("  ✗ " + err.Error())}}
				}
				id := ""
				for _, s := range subs {
					if s.ID == name || strings.EqualFold(s.Subdomain, name) {
						id = s.ID
						break
					}
				}
				if id == "" {
					return printMsg{[]string{stErr.Render("  ✗ no reserved subdomain matched " + name)}}
				}
				if err := cl.releaseSubdomain(ctx, id); err != nil {
					return printMsg{[]string{stErr.Render("  ✗ " + err.Error())}}
				}
				return printMsg{[]string{stOK.Render("  ✓ released " + name)}}
			}
		}
	}
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		subs, err := cl.listSubdomains(ctx)
		if err != nil {
			return printMsg{[]string{stErr.Render("  ✗ " + err.Error())}}
		}
		if len(subs) == 0 {
			return printMsg{[]string{stDim.Render("  no reserved subdomains — ") + stKey.Render("/subdomains reserve <name>")}}
		}
		out := []string{"  " + stTitle.Render("SUBDOMAINS")}
		for _, s := range subs {
			out = append(out, "  "+stURL.Render(s.Subdomain+"."+base))
		}
		return printMsg{out}
	}
}

func cmdDomains(m *model, args []string) tea.Cmd {
	cl := m.cl
	if len(args) >= 2 {
		switch strings.ToLower(args[0]) {
		case "add":
			name := strings.ToLower(args[1])
			return func() tea.Msg {
				ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
				defer cancel()
				res, err := cl.addDomain(ctx, name)
				if err != nil {
					return printMsg{[]string{stErr.Render("  ✗ " + err.Error())}}
				}
				out := []string{
					stOK.Render("  ✓ added ") + stURL.Render(res.Domain.Domain),
					stDim.Render("  set these DNS records, then ") + stKey.Render("/domains verify "+res.Domain.Domain) + stDim.Render(":"),
				}
				if res.DNSInstructions["txt_name"] != "" {
					out = append(out, stDim.Render("    TXT   "+res.DNSInstructions["txt_name"]+"  "+res.DNSInstructions["txt_value"]))
				}
				if res.DNSInstructions["cname_name"] != "" {
					out = append(out, stDim.Render("    CNAME "+res.DNSInstructions["cname_name"]+"  "+res.DNSInstructions["cname_value"]))
				}
				return printMsg{out}
			}
		case "verify":
			name := args[1]
			return func() tea.Msg {
				ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
				defer cancel()
				doms, err := cl.listDomains(ctx)
				if err != nil {
					return printMsg{[]string{stErr.Render("  ✗ " + err.Error())}}
				}
				id := ""
				for _, d := range doms {
					if d.ID == name || strings.EqualFold(d.Domain, name) {
						id = d.ID
						break
					}
				}
				if id == "" {
					return printMsg{[]string{stErr.Render("  ✗ no domain matched " + name)}}
				}
				d, err := cl.verifyDomain(ctx, id)
				if err != nil {
					return printMsg{[]string{stErr.Render("  ✗ " + err.Error())}}
				}
				if d.VerifiedAt != nil {
					return printMsg{[]string{stOK.Render("  ✓ verified " + d.Domain)}}
				}
				return printMsg{[]string{stWarn.Render("  " + d.Domain + " is not verified yet")}}
			}
		}
	}
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		doms, err := cl.listDomains(ctx)
		if err != nil {
			return printMsg{[]string{stErr.Render("  ✗ " + err.Error())}}
		}
		if len(doms) == 0 {
			return printMsg{[]string{stDim.Render("  no custom domains — ") + stKey.Render("/domains add <domain>")}}
		}
		out := []string{"  " + stTitle.Render("DOMAINS")}
		for _, d := range doms {
			status := "pending"
			if d.VerifiedAt != nil {
				status = "verified"
			}
			out = append(out, "  "+stURL.Render(d.Domain)+stDim.Render("  "+status+" · "+firstNonEmpty(d.CertStatus, "—")))
		}
		return printMsg{out}
	}
}

func cmdUninstall(m *model, args []string) tea.Cmd {
	onUninstall := m.opts.OnUninstall
	if onUninstall == nil {
		m.appendLines(stDim.Render("  uninstall isn't available in this build"))
		return nil
	}
	run := func(*model) tea.Cmd {
		return func() tea.Msg {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			msg, err := onUninstall(ctx)
			if err != nil {
				return printMsg{[]string{stErr.Render("  ✗ " + err.Error())}}
			}
			return printMsg{[]string{stOK.Render("  ✓ " + msg)}}
		}
	}
	// "/uninstall yes" still skips the question, for scripts and muscle memory.
	if len(args) > 0 && confirmWord(args[0]) {
		return run(m)
	}
	return m.ask(confirmState{
		title: "Remove trqsh's local data?",
		detail: []string{
			"Stops every tunnel and the background daemon.",
			"Deletes your config, saved sign-in and cached binaries.",
			"The trqsh program itself stays installed.",
		},
		yes: "Uninstall", danger: true, onYes: run, onYesID: "uninstall",
	})
}

// confirmWord reports whether an argument pre-answers a confirm dialog.
func confirmWord(s string) bool {
	switch strings.ToLower(s) {
	case "yes", "y", "-y", "--yes", "force", "-f", "--force":
		return true
	}
	return false
}

func cmdVersion(m *model, _ []string) tea.Cmd {
	m.appendLines("  " + stBrand.Render("trqsh") + " " + m.opts.Version + stDim.Render("  "+runtimePlatform()))
	return nil
}

func cmdClear(m *model, _ []string) tea.Cmd {
	// Same as the first-launch welcome placement in model.go's WindowSizeMsg
	// handler, just replacing the transcript instead of prepending to an
	// empty one — /clear should feel like a fresh console, not a blank one.
	w := m.renderWelcome()
	m.welcomeLen = len(w)
	m.transcript = w
	return nil
}

func cmdHelp(m *model, _ []string) tea.Cmd {
	byName := make(map[string]slashCmd, len(slashCommands))
	for _, c := range slashCommands {
		byName[c.name] = c
	}
	// The usage column only earns its width on a wide terminal; a narrow one
	// keeps the name and what it does.
	argsW := 19
	if m.width < 76 {
		argsW = 0
	}
	for _, g := range []struct {
		title string
		names []string
	}{
		{"SHARE", []string{"http", "tcp", "udp", "start"}},
		{"MANAGE", []string{"ls", "open", "copy", "qr", "stop", "requests"}},
		{"VIEW", []string{"pin", "unpin", "status", "theme", "clear"}},
		{"ACCOUNT", []string{"whoami", "login", "logout", "setup", "subdomains", "domains"}},
		{"SYSTEM", []string{"config", "update", "version", "uninstall", "help", "quit", "down"}},
	} {
		m.appendLines("  " + stTitle.Render(g.title))
		for _, n := range g.names {
			c := byName[n]
			args := ""
			if argsW > 0 {
				args = stDim.Render(pad(c.args, argsW))
			}
			m.appendLines("    " + stKey.Render(pad("/"+c.name, 12)) + args + stSub.Render(c.desc))
		}
		m.appendLines("")
	}
	m.appendLines(
		"  "+stDim.Render("Type a port, like ")+stKey.Render("3000")+stDim.Render(", to share it · the slash is optional · ")+stKey.Render("?")+stDim.Render(" lists keyboard shortcuts"),
	)
	return nil
}

func cmdQuit(_ *model, _ []string) tea.Cmd { return tea.Quit }

// --- helpers ---

// pickTunnel resolves the tunnel an /open call refers to: the arg (id prefix,
// name, or URL substring), or the first tunnel when no arg is given.
func (m model) pickTunnel(args []string) *agent.Tunnel {
	if len(args) == 0 {
		if len(m.tunnels) == 0 {
			return nil
		}
		return &m.tunnels[0]
	}
	return matchTunnel(m.tunnels, args[0])
}

func matchTunnel(tunnels []agent.Tunnel, q string) *agent.Tunnel {
	ql := strings.ToLower(strings.TrimSpace(q))
	if ql == "" {
		return nil
	}
	for i := range tunnels {
		t := &tunnels[i]
		if t.ID == q || strings.EqualFold(t.Name, q) || strings.HasPrefix(t.ID, q) ||
			strings.Contains(strings.ToLower(t.PublicURL), ql) {
			return t
		}
	}
	return nil
}

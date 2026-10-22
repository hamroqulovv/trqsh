// Package tui implements trqsh's interactive terminal UI: a slash-command REPL
// (type `/` to browse commands), a scrolling transcript of what you've run, and
// pinnable live panels (`/pin traffic`) that stay on screen while you keep
// working — the same shape as Claude Code's console, driven entirely from the
// keyboard. It's a client of the local daemon's control API (see client.go), so
// tunnels it starts persist in the background daemon exactly like `trqsh http`.
package tui

import (
	"context"
	"net"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
	"github.com/trqsh-uz/trqsh/internal/agent"
)

// Options configures a TUI session. cli.runTUI fills these from the loaded
// config after ensuring a daemon is up.
type Options struct {
	ShowSetup   bool
	OnSetupDone func(string) error
	Addr        string // control-API address (127.0.0.1:4041)
	Token       string // loopback control-API token
	APIKey      string // stored API key, pushed into the daemon so /cloud/me works
	BaseDomain  string // e.g. trqsh.uz (for display)
	Version     string // agent.Version, shown in the header

	// InitialCommand is the slash command to run on startup — the args the user
	// passed to `trqsh` (e.g. `trqsh http 3000` opens the console and runs it).
	InitialCommand string
	// StartSpecs are the tunnels defined in the config file, used by /start.
	StartSpecs []agent.TunnelSpec
	// ConfigRows are pre-rendered key/value pairs shown by /config, built by cli
	// so the tui package needn't know the config's internals.
	ConfigRows [][2]string

	// OnUpdate and OnUninstall bridge to package cli for the two operations that
	// touch the binary/filesystem (self-replace, local-data removal). They return
	// a summary line to print in the transcript. Nil disables the command.
	OnUpdate    func(context.Context) (string, error)
	OnUninstall func(context.Context) (string, error)
	// OnCheckUpdate reports the newest published CLI version (no leading "v"),
	// for /update's check step. It's a separate bridge from OnUpdate — not a
	// daemon API call (the daemon's GET /update is the desktop app's own
	// update check, against a different release train; the CLI checks its
	// own) — because a running daemon isn't required to check.
	OnCheckUpdate func(context.Context) (string, error)
}

// reqRow is one line in the live traffic feed.
type reqRow struct {
	method string
	path   string
	status int
	ms     int64
	at     time.Time
}

type model struct {
	setup setupState
	opts  Options
	cl    *client

	width, height    int
	ready            bool
	dataLoaded       bool
	accountLoaded    bool
	pixelFrame       int
	pixelTickPending bool
	nextOperation    int
	operations       []loadingOperation
	theme            string
	terminalDark     bool
	themeColors      map[string]string

	input textarea.Model
	vp    viewport.Model

	transcript []string // rendered lines (may contain ANSI), shown in the viewport

	// live data (kept fresh by polling + the SSE feed)
	status   agent.Status
	authed   bool
	acct     *account
	tunnels  []agent.Tunnel
	requests []reqRow

	pins []string // ordered, unique: "traffic" | "tunnels" | "status"

	// /qr remote-control pairing (see commands.go's cmdQR and this file's
	// handleRemoteEvent). remoteCode is "" when no pairing is active.
	remoteCode         string
	remoteURL          string
	remoteConnected    bool
	pendingRemoteLines []string // transcript lines queued to publish this Update() tick

	// autocomplete menu (command names, or argument options: tunnels for /stop,
	// detected ports for /http, panels for /pin…)
	menuItems []menuEntry
	menuIdx   int
	// menuFreeform marks a menu of suggestions for a free-form argument (a
	// port): Enter runs what was typed unless the user arrowed to a suggestion.
	menuFreeform bool
	menuMoved    bool

	// confirm is the open yes/no dialog guarding a destructive command (see
	// confirm.go); nil when none is showing. remoteRun is true while a paired
	// phone's command runs, so ask() can skip the dialog for it.
	confirm   *confirmState
	remoteRun bool

	// localPorts are common dev-server ports found listening on this machine,
	// offered as /http suggestions and in the welcome banner.
	localPorts []int
	portsAt    time.Time
	probing    bool

	// command history: up/down recalls previously entered lines to edit.
	history    []string
	historyIdx int // cursor into history; == len(history) means "not browsing"

	// selectAll is true right after Ctrl+A: the whole input reads as
	// selected (highlighted in renderInputBox) until the next key either
	// acts on it (typing replaces it, Backspace/Delete clears it) or
	// cancels it (anything else, which then runs normally — see handleKey).
	selectAll bool

	// flash replaces the footer's key hints for a moment ("Press Ctrl+C again
	// to quit"); flashSeq lets a newer message outlive an older one's timer.
	// quitArmed is set by the first Ctrl+C on an empty line (see keys.go).
	flash     string
	flashSeq  int
	quitArmed bool
	// showKeys is the "?" shortcut sheet, drawn where the menu goes.
	showKeys bool
	// lastReqAt is when the newest request arrived, for the footer's pulse.
	lastReqAt time.Time

	welcomeShown bool // the welcome banner has been placed in the transcript
	welcomeLen   int  // how many leading transcript lines the banner occupies
	loginActive  bool // a device-flow sign-in is polling
	initialRan   bool // the InitialCommand (if any) has been dispatched
	quitting     bool
}

// menuEntry is one row of the autocomplete popup. insert is what replaces the
// input when it's accepted; run means Enter should execute it immediately
// (no-argument commands and fully-chosen argument values) rather than just
// completing the text so the user can keep typing.
type menuEntry struct {
	insert string
	label  string
	desc   string
	run    bool
}

// --- messages ---

type tickMsg time.Time
type dataMsg struct {
	tunnels []agent.Tunnel
	status  agent.Status
	ok      bool
}
type accountMsg struct {
	acct   *account
	authed bool
}
type eventMsg agent.Event
type printMsg struct{ lines []string } // append lines to the transcript
type loginStartedMsg struct{ d *deviceStart }
type loginTickMsg struct {
	deviceCode string
	interval   time.Duration
}
type loginDoneMsg struct {
	ok  bool
	msg string
}
type remoteStartedMsg struct{ code, url string }
type portsMsg struct{ ports []int }

// Run starts the TUI and blocks until the user quits.
func Run(opts Options) error {
	terminalDark := lipgloss.HasDarkBackground()
	defer lipgloss.SetHasDarkBackground(terminalDark)
	cl := newClient(opts.Addr, opts.Token)
	// WithMouseCellMotion makes the wheel arrive as mouse events the viewport
	// scrolls with, instead of the terminal translating it to ↑/↓ key presses
	// (which would drive command history). Hold Shift to select/copy text.
	p := tea.NewProgram(newModel(opts, cl), tea.WithAltScreen(), tea.WithMouseCellMotion())

	// Fan the daemon's SSE feed into the Bubble Tea message loop. Canceling ctx
	// on return unblocks the reader so the goroutine doesn't leak past quit.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go cl.streamEvents(ctx, func(ev agent.Event) { p.Send(eventMsg(ev)) })

	final, err := p.Run()
	if finished, ok := final.(model); ok && finished.setup.cancel != nil {
		finished.setup.cancel()
	}

	// Best-effort: end any active pairing so a paired phone sees the session
	// close right away instead of quietly going stale — the daemon (and any
	// pairing it's holding open on the control plane) outlives this console
	// process. A no-op, harmless either way, when no pairing was ever started.
	stopCtx, stopCancel := context.WithTimeout(context.Background(), 3*time.Second)
	_ = cl.remoteStop(stopCtx)
	stopCancel()

	return err
}

func newModel(opts Options, cl *client) model {
	ta := textarea.New()
	ta.ShowLineNumbers = false
	ta.Placeholder = "type / for commands"
	ta.CharLimit = 240
	ta.SetPromptFunc(2, inputPrompt) // wrapped lines stay aligned with the command
	ta.FocusedStyle.Prompt = stBrand
	ta.BlurredStyle.Prompt = stBrand
	ta.FocusedStyle.Text = stText
	ta.BlurredStyle.Text = stText
	ta.FocusedStyle.Placeholder = stDim
	ta.BlurredStyle.Placeholder = stDim
	ta.FocusedStyle.EndOfBuffer = stDim
	ta.BlurredStyle.EndOfBuffer = stDim
	ta.BlurredStyle.CursorLine = stText
	ta.Cursor.Style = stMenuSel
	ta.FocusedStyle.CursorLine = lipgloss.NewStyle() // no full-line highlight — stays a plain prompt, not an editor
	ta.SetHeight(1)
	ta.Focus()

	vp := viewport.New(0, 0)
	vp.MouseWheelEnabled = true

	// The welcome banner is placed on the first WindowSizeMsg, once the width is
	// known to size its box to.
	m := model{opts: opts, cl: cl, input: ta, vp: vp, theme: "auto", terminalDark: lipgloss.HasDarkBackground()}
	if opts.ShowSetup {
		m.openSetup()
	}
	return m
}

// inputPrompt shows the chevron only on the input's first visual row, so a
// line that wraps onto more rows doesn't repeat "› " down the left edge.
func inputPrompt(line int) string {
	if line == 0 {
		return "› "
	}
	return "  "
}

func (m model) Init() tea.Cmd {
	return tea.Batch(textarea.Blink, m.poll(), m.fetchAccount(), tickCmd(), m.probePorts())
}

// probePorts looks for local dev servers in the background. It's cheap (a
// handful of loopback dials) but not free, so it runs at startup and again
// only when a port suggestion is about to be shown and the last scan is stale.
func (m model) probePorts() tea.Cmd {
	skip := 0
	if _, p, err := net.SplitHostPort(m.opts.Addr); err == nil {
		skip, _ = strconv.Atoi(p)
	}
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		return portsMsg{ports: probeLocalPorts(ctx, skip)}
	}
}

// maybeProbePorts re-scans when a port picker is open and the scan is stale.
func (m *model) maybeProbePorts() tea.Cmd {
	if m.probing || !m.menuFreeform || time.Since(m.portsAt) < 3*time.Second {
		return nil
	}
	m.probing = true
	return m.probePorts()
}

// --- commands (async work) ---

func tickCmd() tea.Cmd {
	return tea.Tick(1500*time.Millisecond, func(t time.Time) tea.Msg { return tickMsg(t) })
}

func (m model) poll() tea.Cmd {
	cl := m.cl
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		ts, err := cl.tunnels(ctx)
		st, _ := cl.status(ctx)
		return dataMsg{tunnels: ts, status: st, ok: err == nil}
	}
}

func (m model) fetchAccount() tea.Cmd {
	cl, key := m.cl, m.opts.APIKey
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()
		if key != "" {
			_ = cl.login(ctx, key) // make sure the daemon can reach the cloud as us
		}
		a, err := cl.me(ctx)
		return accountMsg{acct: a, authed: err == nil}
	}
}

func (m model) pollLogin(deviceCode string, interval time.Duration) tea.Cmd {
	cl := m.cl
	return func() tea.Msg {
		time.Sleep(interval)
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		authed, pending, err := cl.oauthPoll(ctx, deviceCode)
		switch {
		case err != nil:
			return loginDoneMsg{ok: false, msg: err.Error()}
		case authed:
			return loginDoneMsg{ok: true}
		default:
			_ = pending
			return loginTickMsg{deviceCode: deviceCode, interval: interval}
		}
	}
}

// --- update loop ---

func (m model) update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd
	switch msg := msg.(type) {
	case setupDeviceMsg:
		return m.setupDevice(msg)
	case setupResultMsg:
		return m.setupResult(msg)
	case tea.WindowSizeMsg:
		m.width, m.height = max(0, msg.Width), max(0, msg.Height)
		m.ready = true
		if !m.welcomeShown {
			m.welcomeShown = true
			w := m.renderWelcome()
			m.welcomeLen = len(w)
			m.transcript = append(w, m.transcript...)
		}
		m.refreshWelcome()
		m.relayout()
		// Run the command the user typed after `trqsh` (e.g. `trqsh http 3000`),
		// now that the viewport is sized so its output lands in the transcript.
		if !m.initialRan && strings.TrimSpace(m.opts.InitialCommand) != "" {
			m.initialRan = true
			return m.run(m.opts.InitialCommand, false)
		}
		return m, nil

	case tea.KeyMsg:
		if m.setup.stage != "" {
			return m.setupKey(msg)
		}
		if m.confirm != nil {
			return m.confirmKey(msg)
		}
		return m.handleKey(msg)

	case tickMsg:
		cmds = append(cmds, m.poll(), tickCmd())

	case dataMsg:
		m.dataLoaded = true
		if msg.ok {
			m.tunnels = msg.tunnels
		}
		m.status = msg.status
		m.refreshWelcome()
		m.relayout()
		if m.remoteCode != "" {
			cmds = append(cmds, m.publishRemoteState())
		}

	case accountMsg:
		m.accountLoaded = true
		m.acct, m.authed = msg.acct, msg.authed
		m.refreshWelcome()
		m.relayout()

	case eventMsg:
		cmds = append(cmds, m.handleEvent(agent.Event(msg)))
		m.relayout()

	case portsMsg:
		m.probing, m.localPorts, m.portsAt = false, msg.ports, time.Now()
		if m.menuOpen() || m.menuFreeform {
			idx, moved := m.menuIdx, m.menuMoved
			m.refreshMenu()
			m.menuIdx, m.menuMoved = min(idx, max(0, len(m.menuItems)-1)), moved
		}
		m.refreshWelcome()
		m.relayout()

	case remoteStartedMsg:
		m.remoteCode, m.remoteURL = msg.code, msg.url
		renderPairQR(&m, msg.url, msg.code)

	case printMsg:
		m.appendLines(msg.lines...)

	case flashDoneMsg:
		m.clearFlash(msg)

	case loginStartedMsg:
		m.loginActive = true
		url := firstNonEmpty(msg.d.VerificationURIComplete, msg.d.VerificationURI)
		// The approval URL and code are a credential in flight: show them here
		// only, never in the transcript a paired viewer mirrors.
		m.appendLocalLines(
			"  "+stTitle.Render("Sign in"),
			"  "+stDim.Render("open ")+stURL.Render(url),
			"  "+stDim.Render("code ")+stKey.Render(msg.d.UserCode),
			stDim.Render("  waiting for approval… (keep using other commands)"),
		)
		_ = openBrowser(url)
		interval := time.Duration(max(msg.d.Interval, 2)) * time.Second
		cmds = append(cmds, m.pollLogin(msg.d.DeviceCode, interval))

	case loginTickMsg:
		cmds = append(cmds, m.pollLogin(msg.deviceCode, msg.interval))

	case loginDoneMsg:
		m.loginActive = false
		if msg.ok {
			// The daemon now owns the newly signed-in credential. Drop the key read
			// at startup, or fetchAccount would push the old account back over it.
			m.opts.APIKey = ""
			m.appendLines(stOK.Render("  ✓ signed in"))
			cmds = append(cmds, m.fetchAccount())
		} else {
			m.appendLines(stErr.Render("  ✗ sign-in failed: " + msg.msg))
		}
	}

	// Flush this tick's queued transcript lines to a paired phone as one POST,
	// rather than one per appendLines call.
	if len(m.pendingRemoteLines) > 0 {
		lines := m.pendingRemoteLines
		m.pendingRemoteLines = nil
		cmds = append(cmds, m.publishRemoteLines(lines))
	}

	// Keep the input caret blinking and the viewport responsive to mouse wheel.
	var c tea.Cmd
	if m.setup.stage == "key" || m.setup.stage == "port" {
		m.setup.input, c = m.setup.input.Update(msg)
		cmds = append(cmds, c)
	}
	m.input, c = m.input.Update(msg)
	cmds = append(cmds, c)
	m.vp, c = m.vp.Update(msg)
	cmds = append(cmds, c)
	return m, tea.Batch(cmds...)
}

func (m model) handleKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	// The "?" sheet closes on any key. Esc and "?" only close it; anything
	// else also does its usual job, so the sheet never costs a keystroke.
	if m.showKeys {
		m.showKeys = false
		m.relayout()
		if msg.Type == tea.KeyEsc || msg.String() == "?" {
			return m, nil
		}
	}
	if msg.Type != tea.KeyCtrlC && m.quitArmed {
		m.quitArmed, m.flash = false, ""
	}
	if next, cmd, ok := m.quickKey(msg); ok {
		return next, cmd
	}
	if msg.String() == "?" && m.input.Value() == "" {
		m.showKeys = true
		m.relayout()
		return m, nil
	}
	menuOpen := m.menuOpen()

	// Ctrl+A selects the whole input, GUI-style — not the textarea library's
	// emacs-default "jump to line start" (Home still does that). While
	// selected: typing replaces everything, Backspace/Delete clears it
	// (both handled below by clearing first, then letting the same
	// keystroke fall through to the normal handling further down); any
	// other key just cancels the selection and runs normally.
	if msg.Type == tea.KeyCtrlA {
		if strings.TrimSpace(m.input.Value()) != "" {
			m.selectAll = true
		}
		return m, nil
	}
	if m.selectAll {
		m.selectAll = false
		switch msg.Type {
		case tea.KeyRunes, tea.KeySpace, tea.KeyBackspace, tea.KeyDelete:
			m.input.SetValue("")
			m.input.CursorEnd()
		}
	}

	switch msg.Type {
	case tea.KeyPgUp:
		m.vp.HalfPageUp()
		return m, nil
	case tea.KeyPgDown:
		m.vp.HalfPageDown()
		return m, nil
	case tea.KeyEnd: // jump to the latest output (the "scroll to bottom" affordance)
		m.vp.GotoBottom()
		return m, nil
	case tea.KeyCtrlL: // the shell's "clear screen"
		cmdClear(&m, nil)
		m.relayout()
		return m, nil
	}

	switch msg.String() {
	case "up", "ctrl+p":
		if menuOpen {
			m.menuIdx = (m.menuIdx - 1 + len(m.menuItems)) % len(m.menuItems) // wraps
			m.menuMoved = true
			return m, nil
		}
		m.historyPrev() // recall an earlier command to edit
		m.relayout()
		return m, nil
	case "down", "ctrl+n":
		if menuOpen {
			m.menuIdx = (m.menuIdx + 1) % len(m.menuItems)
			m.menuMoved = true
			return m, nil
		}
		m.historyNext()
		m.relayout()
		return m, nil
	case "tab":
		if menuOpen {
			m.acceptMenu()
			m.relayout()
			return m, nil
		}
		// On an empty prompt, Tab takes the suggested next step.
		if line, _ := m.nextStep(); line != "" && m.input.Value() == "" {
			m.input.SetValue(line)
			m.input.CursorEnd()
			m.refreshMenu()
			m.relayout()
			return m, nil
		}
	case "esc":
		// Esc clears the line — with or without the menu open — so there's
		// always one key that gets you back to an empty prompt.
		if menuOpen || m.input.Value() != "" {
			m.clearInput()
			m.relayout()
			return m, nil
		}
	case "enter":
		return m.submit()
	}

	// Ordinary editing: let the text input handle the key, reset the history
	// browse cursor to the end, recompute the menu, and re-flow the layout.
	var c tea.Cmd
	m.input, c = m.input.Update(msg)
	m.historyIdx = len(m.history)
	m.refreshMenu()
	m.relayout()
	return m, tea.Batch(c, m.maybeProbePorts())
}

// historyPrev recalls the previous command into the input (older).
func (m *model) historyPrev() {
	if len(m.history) == 0 {
		return
	}
	if m.historyIdx > 0 {
		m.historyIdx--
	}
	m.input.SetValue(m.history[m.historyIdx])
	m.input.CursorEnd()
	m.refreshMenu()
}

// historyNext moves toward newer commands, clearing the input past the newest.
func (m *model) historyNext() {
	if len(m.history) == 0 {
		return
	}
	if m.historyIdx < len(m.history)-1 {
		m.historyIdx++
		m.input.SetValue(m.history[m.historyIdx])
	} else {
		m.historyIdx = len(m.history)
		m.input.SetValue("")
	}
	m.input.CursorEnd()
	m.refreshMenu()
}

// submit runs the current input line, or — when the command menu is open —
// accepts the highlighted command (running it if it needs no arguments,
// otherwise completing it so the user can add them).
func (m model) submit() (tea.Model, tea.Cmd) {
	if m.menuOpen() {
		sel := m.menuItems[m.menuIdx]
		// A typed free-form value (a port) wins over a suggestion the user
		// didn't pick: "/http 80" must not start 8080 just because it's listed.
		_, typed := parseLine(m.input.Value())
		if !m.menuFreeform || m.menuMoved || len(typed) == 0 {
			m.input.SetValue(sel.insert)
			m.input.CursorEnd()
			if !sel.run { // a command that still needs arguments: complete, keep editing
				m.refreshMenu()
				m.relayout()
				return m, m.maybeProbePorts()
			}
		}
	}
	line := strings.TrimSpace(m.input.Value())
	m.input.SetValue("")
	m.refreshMenu()
	if line == "" {
		m.relayout()
		return m, nil
	}
	if rewritten, ok := barePort(line); ok {
		line = rewritten // "3000" is recorded as what it ran: "/http 3000"
	}
	// A command missing its required argument opens the picker for it instead
	// of printing a usage error: "/stop" lists the running tunnels to choose.
	if name, args := parseLine(line); len(args) == 0 {
		if c, ok := lookupCommand(name); ok && strings.HasPrefix(c.args, "<") && len(m.argOptions(c.name)) > 0 {
			m.input.SetValue("/" + c.name + " ")
			m.input.CursorEnd()
			m.refreshMenu()
			m.relayout()
			return m, m.maybeProbePorts()
		}
	}
	m.pushHistory(line)
	return m.run(line, false)
}

// pushHistory records a submitted line for up/down recall, skipping consecutive
// duplicates, and resets the browse cursor to the end.
func (m *model) pushHistory(line string) {
	if n := len(m.history); n == 0 || m.history[n-1] != line {
		m.history = append(m.history, line)
	}
	m.historyIdx = len(m.history)
}

// run executes a slash-command line, either typed locally (remote=false) or
// received from a paired phone (remote=true — see handleRemoteEvent). Remote
// commands are checked against remoteAllowed first: they never even reach
// the echo line, since running them at all is the thing being refused, not
// just how it's displayed.
func (m model) run(line string, remote bool) (tea.Model, tea.Cmd) {
	if rewritten, ok := barePort(line); ok {
		line = rewritten
	}
	name, args := parseLine(line)
	cmd, ok := lookupCommand(name)
	if remote && ok && !remoteAllowed[cmd.name] {
		m.appendLines(stWarn.Render("  ⚠ blocked: ") + stKey.Render("/"+cmd.name) + stDim.Render(" only runs from the laptop"))
		m.relayout()
		return m, nil
	}
	if remote && ok && cmd.name == "http" && (len(args) == 0 || !remoteTunnelTarget(args[0])) {
		m.appendLines(stWarn.Render("  ⚠ blocked: ") + stKey.Render("/http") + stDim.Render(" from the phone can only share a port on this machine"))
		m.relayout()
		return m, nil
	}
	// A blank line separates interactions; the echo uses an accented chevron
	// (or a phone glyph for a remote command) and a bold command so it reads
	// as a distinct "you ran this", not plain text.
	chevron := "  ❯ "
	if remote {
		chevron = "  📱 "
	}
	// The echo is mirrored to any paired viewer: never print a pasted key.
	echo := line
	if ok && cmd.name == "login" && len(args) > 0 {
		echo = "/login ••••••••"
	}
	m.appendLines("", stKey.Render(chevron)+stEcho.Render(echo))
	if !ok {
		hint := stDim.Render("   type ") + stKey.Render("/") + stDim.Render(" to browse commands")
		if guess := suggestCommand(name); guess != "" {
			hint = stDim.Render("   did you mean ") + stKey.Render("/"+guess) + stDim.Render("?")
		}
		m.appendLines(stErr.Render("  ✗ unknown command: /"+name) + hint)
		m.relayout()
		return m, nil
	}
	m.remoteRun = remote
	c := cmd.run(&m, args)
	m.remoteRun = false
	if c != nil && cmd.name != "quit" && cmd.name != "down" {
		c = m.trackOperation(cmd.name, args, c)
	}
	m.relayout()
	return m, c
}

// --- autocomplete menu ---

func (m model) menuOpen() bool { return len(m.menuItems) > 0 }

func (m *model) refreshMenu() {
	m.menuItems = nil
	m.menuIdx = 0
	m.menuFreeform, m.menuMoved = false, false
	v := m.input.Value()
	if m.confirm != nil || strings.TrimSpace(v) == "" {
		return
	}
	if !strings.HasPrefix(v, "/") {
		// Every line is a command, so the slash is optional: a bare port
		// offers the ways to share it, and a bare word is matched against
		// command names exactly as if it began with "/".
		if port := strings.TrimSpace(v); isPort(port) {
			m.menuItems = m.portMenu(port)
			return
		}
		if c := v[0]; (c < 'a' || c > 'z') && (c < 'A' || c > 'Z') {
			return
		}
		v = "/" + v
	}
	fields := strings.Fields(v[1:])
	trailingSpace := strings.HasSuffix(v, " ")

	// Still choosing the command name (one partial token, no space yet).
	// Prefix matches come first, then commands that merely contain the text or
	// have an alias starting with it ("/kill" finds /stop), so a half-remembered
	// name still turns something up.
	if len(fields) <= 1 && !trailingSpace {
		prefix := ""
		if len(fields) == 1 {
			prefix = strings.ToLower(fields[0])
		}
		var later []menuEntry
		for _, c := range slashCommands {
			insert, run := "/"+c.name, c.args == ""
			// Enter on /theme reports its current mode; Tab still offers choices.
			if c.name == "theme" {
				run = true
			}
			label := "/" + c.name
			if c.args != "" {
				insert += " "
				label += " " + c.args
			}
			e := menuEntry{insert: insert, label: label, desc: c.desc, run: run}
			switch {
			case strings.HasPrefix(c.name, prefix):
				m.menuItems = append(m.menuItems, e)
			case len(prefix) >= 3 && (strings.Contains(c.name, prefix) || aliasMatches(c.name, prefix)):
				later = append(later, e)
			}
		}
		m.menuItems = append(m.menuItems, later...)
		return
	}

	// Choosing the first argument for a command that offers choices, so the
	// user can arrow-select a tunnel or panel instead of typing it.
	name := strings.ToLower(fields[0])
	if c, ok := lookupCommand(name); ok {
		name = c.name
	}
	argPrefix := ""
	switch {
	case len(fields) == 1 && trailingSpace:
	case len(fields) == 2 && !trailingSpace:
		argPrefix = strings.ToLower(fields[1])
	default:
		return // past the first argument: free typing
	}
	m.menuFreeform = freeformArg[name]
	for _, opt := range m.argOptions(name) {
		if strings.HasPrefix(strings.ToLower(opt.value), argPrefix) ||
			(argPrefix != "" && strings.Contains(strings.ToLower(opt.desc), argPrefix)) {
			insert := "/" + name + " " + opt.value
			if opt.more {
				insert += " "
			}
			m.menuItems = append(m.menuItems, menuEntry{insert: insert, label: "/" + name + " " + opt.value, desc: opt.desc, run: !opt.more})
		}
	}
}

// portMenu lists the protocols a bare port can be shared over, HTTP first.
func (m *model) portMenu(port string) []menuEntry {
	addr := "localhost:" + port
	httpDesc := "Share " + addr + " at a public HTTPS URL"
	for _, t := range m.tunnels {
		if t.LocalAddr == addr {
			httpDesc = "Already shared at " + t.PublicURL
		}
	}
	return []menuEntry{
		{insert: "/http " + port, label: "/http " + port, desc: httpDesc, run: true},
		{insert: "/tcp " + port, label: "/tcp " + port, desc: "Raw TCP — databases, SSH, game servers", run: true},
		{insert: "/udp " + port, label: "/udp " + port, desc: "UDP datagrams — DNS, VoIP, games", run: true},
	}
}

// argOption is one selectable value for a command's first argument. more
// means the value still needs further input ("/subdomains reserve <name>").
type argOption struct {
	value, desc string
	more        bool
}

// freeformArg lists commands whose argument options are only suggestions —
// any value may be typed (see submit).
var freeformArg = map[string]bool{"http": true, "tcp": true, "udp": true}

// argOptions returns the selectable argument values for a command (empty for
// commands whose arguments are entirely free-form).
func (m *model) argOptions(name string) []argOption {
	tunnelOpts := func() []argOption {
		var out []argOption
		for _, t := range m.tunnels {
			out = append(out, argOption{value: shortID(t.ID), desc: t.PublicURL + "  → " + t.LocalAddr})
		}
		return out
	}
	switch name {
	case "http", "tcp", "udp":
		shared := map[string]string{}
		for _, t := range m.tunnels {
			shared[t.LocalAddr] = t.PublicURL
		}
		var out []argOption
		for _, p := range m.localPorts {
			port := strconv.Itoa(p)
			desc := "something is listening on localhost:" + port
			if url, ok := shared["localhost:"+port]; ok {
				desc = "already shared at " + url
			}
			out = append(out, argOption{value: port, desc: desc})
		}
		return out
	case "stop":
		out := tunnelOpts()
		if len(out) > 1 {
			out = append(out, argOption{value: "all", desc: "stop every tunnel"})
		}
		return out
	case "open", "copy":
		return tunnelOpts()
	case "qr":
		var out []argOption
		if m.remoteCode != "" {
			out = append(out, argOption{value: "stop", desc: "end the phone pairing"})
		}
		for _, t := range m.tunnels {
			out = append(out, argOption{value: shortID(t.ID), desc: "QR code for " + t.PublicURL})
		}
		return out
	case "pin":
		var out []argOption
		for _, p := range []argOption{
			{value: "traffic", desc: "live request feed"},
			{value: "tunnels", desc: "running tunnels and their URLs"},
			{value: "status", desc: "connection, edge and transport"},
		} {
			if !slices.Contains(m.pins, p.value) {
				out = append(out, p)
			}
		}
		return out
	case "unpin":
		var out []argOption
		for _, p := range m.pins {
			out = append(out, argOption{value: p})
		}
		if len(m.pins) > 1 {
			out = append(out, argOption{value: "all"})
		}
		return out
	case "theme":
		return []argOption{{value: "auto", desc: "follow the terminal"}, {value: "dark"}, {value: "light"}}
	case "update":
		return []argOption{{value: "check", desc: "only check, don't install"}}
	case "subdomains":
		return []argOption{{value: "reserve", desc: "claim a name", more: true}, {value: "release", desc: "give one back", more: true}}
	case "domains":
		return []argOption{{value: "add", desc: "connect a domain you own", more: true}, {value: "verify", desc: "check its DNS records", more: true}}
	}
	return nil
}

func (m *model) acceptMenu() {
	if !m.menuOpen() {
		return
	}
	m.input.SetValue(m.menuItems[m.menuIdx].insert)
	m.input.CursorEnd()
	m.refreshMenu()
}

// --- live event handling ---

func (m *model) handleEvent(ev agent.Event) tea.Cmd {
	switch ev.Type {
	case "request":
		if ev.Request != nil {
			m.requests = append(m.requests, reqRow{
				method: ev.Request.Method, path: ev.Request.Path,
				status: ev.Request.Status, ms: ev.Request.DurationMs, at: time.Now(),
			})
			m.lastReqAt = time.Now()
			if len(m.requests) > 500 {
				m.requests = m.requests[len(m.requests)-500:]
			}
		}
	case "status":
		if ev.Status != nil {
			m.status = *ev.Status
		}
	case "error":
		if ev.Err != "" {
			m.appendLines(stWarn.Render("  ! " + ev.Err))
		}
	case "remote":
		return m.handleRemoteEvent(ev.Remote)
	}
	return nil
}

// handleRemoteEvent reacts to a /qr pairing notification, delivered as a
// "remote" Event over the same stream as everything else (see
// internal/agent/remoteapi.go's pump). "command" runs exactly like a locally
// typed line — through the same run() a submitted line goes through, subject
// to the same remoteAllowed list — so a paired phone is a second
// keyboard into this console, not a separate code path.
func (m *model) handleRemoteEvent(ev *agent.RemoteEvent) tea.Cmd {
	if ev == nil {
		return nil
	}
	switch ev.Kind {
	case "presence":
		m.remoteConnected = ev.Connected
		if ev.Connected {
			m.appendLines(stOK.Render("  ✓ 📱 phone connected"))
		} else {
			m.appendLines(stDim.Render("  📱 phone disconnected"))
		}
	case "ended":
		m.remoteCode, m.remoteURL, m.remoteConnected = "", "", false
		m.appendLines(stDim.Render("  📱 pairing ended"))
	case "command":
		// Terminal safety net: the relay and daemon already refuse these, but
		// the console is the one that echoes into a real terminal.
		if !agent.SafeRemoteCommand(ev.Command) {
			m.appendLines(stWarn.Render("  ⚠ blocked: ") + stDim.Render("a phone command with control characters"))
			return nil
		}
		updated, cmd := m.run(ev.Command, true)
		*m = updated.(model)
		return cmd
	}
	return nil
}

// publishRemoteState sends a fresh tunnels/status snapshot to the active
// pairing's viewers, at the same ~1.5s cadence the console already polls the
// daemon at — no separate timer, and cheap enough at that rate not to need
// change-detection before publishing.
func (m model) publishRemoteState() tea.Cmd {
	cl := m.cl
	tunnels := make([]remoteTunnel, 0, len(m.tunnels))
	for _, t := range m.tunnels {
		tunnels = append(tunnels, remoteTunnel{
			ID: t.ID, PublicURL: t.PublicURL, LocalAddr: t.LocalAddr,
			Status: t.Status, Requests: t.Metrics.Requests,
		})
	}
	st := remoteState{Online: m.status.Connected, Edge: m.status.Edge, Tunnels: tunnels}
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = cl.remotePublishState(ctx, st) // best-effort; not paired or unreachable is a silent no-op
		return nil
	}
}

// publishRemoteLines flushes lines queued by appendLines while paired. A
// separate tea.Cmd (rather than publishing inline) so a command's whole
// multi-line output goes out as one POST instead of one per line.
func (m model) publishRemoteLines(lines []string) tea.Cmd {
	cl := m.cl
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = cl.remotePublishLines(ctx, lines)
		return nil
	}
}

// appendLines adds rendered lines to the transcript and follows to the
// bottom. While a /qr pairing is active, plain-text (ANSI-stripped) copies
// are also queued for publishRemoteLines to flush at the end of this
// Update() tick, so a paired phone mirrors the same transcript.
func (m *model) appendLines(lines ...string) {
	if len(m.themeColors) > 0 {
		lines = append([]string(nil), lines...)
		for i := range lines {
			lines[i] = rethemeLine(lines[i], m.themeColors)
		}
	}
	m.transcript = append(m.transcript, lines...)
	if m.remoteCode != "" {
		for _, l := range lines {
			m.pendingRemoteLines = append(m.pendingRemoteLines, ansi.Strip(l))
		}
	}
	if m.width > 0 {
		m.vp.SetContent(strings.Join(m.transcript, "\n"))
		m.vp.GotoBottom()
	}
}

// appendLocalLines is appendLines for text that must stay on this terminal —
// it is not queued for a paired viewer's mirror.
func (m *model) appendLocalLines(lines ...string) {
	code := m.remoteCode
	m.remoteCode = ""
	m.appendLines(lines...)
	m.remoteCode = code
}

// maxInputRows caps how tall the input box can grow with a long or wrapped
// line before it scrolls internally instead of crowding out the transcript.
const maxInputRows = 6

// relayout re-sizes the input box to fit its current content (wrapping wide
// lines down instead of scrolling them sideways) and then re-sizes the
// viewport to whatever space the header, pinned panels, autocomplete menu,
// and that input box leave, preserving the reader's scroll position unless
// they were already following the tail.
func (m *model) relayout() {
	if m.width < 1 || m.height < 1 {
		m.vp.Width, m.vp.Height = m.width, 0
		return
	}
	oldWidth, oldHeight := m.input.Width(), m.input.Height()
	m.input.SetWidth(max(4, m.width-2))
	m.input.Placeholder = m.placeholder()
	rows := max(m.input.LineInfo().Height, m.input.LineCount())
	// Leave room for the header, hints and output before allowing a long
	// command to grow. Very short terminals keep a single editable row.
	inputRows := max(1, min(rows, maxInputRows, max(1, m.height-9)))
	m.input.SetHeight(inputRows)
	m.syncInputView(oldWidth != m.input.Width() || oldHeight != inputRows)

	atBottom := m.vp.AtBottom()
	m.vp.Width = m.width
	m.vp.Height = m.frame().viewportRows
	m.vp.SetContent(strings.Join(m.transcript, "\n"))
	switch {
	case m.welcomeLen > 0 && len(m.transcript) <= m.welcomeLen:
		m.vp.GotoTop()
	case atBottom:
		m.vp.GotoBottom()
	}
}

// placeholder is the empty prompt's ghost text: the suggested next step when
// there is one (Tab fills it in), otherwise how to begin. The longest variant
// that fits is used.
func (m model) placeholder() string {
	var variants []string
	line, why := m.nextStep()
	switch {
	case m.confirm != nil:
		variants = []string{"Y to confirm · N to cancel"}
	case line != "":
		variants = []string{"Tab → " + line + "  (" + why + ")", "Tab → " + line}
	case len(m.tunnels) > 0:
		variants = []string{"Type / for commands · ? for shortcuts", "/ for commands"}
	default:
		variants = []string{"Type a port to share it, like 3000 · / for commands", "Type a port, or / for commands", "Port or /command"}
	}
	for _, v := range variants {
		if lipgloss.Width(v) <= m.width-6 {
			return v
		}
	}
	return variants[len(variants)-1]
}

// SetWidth/SetHeight do not reposition Bubbles' internal textarea viewport.
// Populate it first, then reset the scroll origin on resize and restore the
// cursor. A neutral Update brings the active row into the resized viewport.
func (m *model) syncInputView(resized bool) {
	_ = m.input.View()
	if resized {
		row := m.input.Line()
		info := m.input.LineInfo()
		col := info.StartColumn + info.ColumnOffset
		for m.input.Line() > 0 {
			m.input.CursorUp()
		}
		m.input.CursorStart()
		m.input, _ = m.input.Update(nil)
		for m.input.Line() < row {
			m.input.CursorDown()
		}
		m.input.SetCursor(col)
	}
	m.input, _ = m.input.Update(nil)
}

// runtimePlatform keeps /version's platform label in one place.
func runtimePlatform() string { return runtime.GOOS + "/" + runtime.GOARCH }

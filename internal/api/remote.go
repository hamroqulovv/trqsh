package api

// internal/api/remote.go implements the /qr "remote control" pairing relay: a
// signed-in CLI daemon opens an agent-side session here, the console renders
// its code as a QR pointing at qr.<base>/<code>, and a phone that scans it
// (viewer side — no login, the code itself is the capability) gets a live
// mirror of the console and can send commands back. Both legs use the same
// shape as the daemon's own loopback control API: SSE for the receiving
// direction, plain POSTs for the sending direction — so this hub is just two
// named pipes per session, fanned out to any number of viewers.
//
// In-process only today: fine for the single API replica this runs on now. A
// Redis pub/sub-backed hub is the natural upgrade if the control API ever
// scales past one replica — same seam already used for the device store and
// OAuth state (see device_redis.go, oauth_state.go) — but isn't built until
// that's actually needed.

import (
	"crypto/rand"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/trqsh-uz/trqsh/internal/api/auth"
)

// remoteSessionTTL bounds how long a pairing stays connectable after
// creation. The console requests a fresh code every time /qr runs (ending
// any prior session for that daemon), so this is a backstop for abandoned
// sessions, not the primary lifetime control.
const remoteSessionTTL = 30 * time.Minute

// remoteBacklogLimit caps how many recent transcript lines are replayed to a
// viewer that connects mid-session, so a phone joining late has context
// instead of a blank screen, without the backlog growing unbounded.
const remoteBacklogLimit = 200

// Abuse bounds. The viewer side is reachable by anyone holding a code, and the
// agent side by any signed-in key, so every per-session / per-org resource is
// capped.
const (
	remoteMaxViewers       = 16   // concurrent viewer streams per session
	remoteMaxSessionsOrg   = 10   // live sessions per org
	remoteMaxCommandBytes  = 240  // one typed/tapped command
	remoteMaxPublishLines  = 500  // lines in one publish
	remoteMaxLineBytes     = 2000 // one transcript line (longer is truncated)
	remoteMaxTunnels       = 100  // tunnels in one state snapshot
	remoteMaxStateFieldLen = 512  // any string in a state snapshot
)

// Extend the HTTP server's write deadline as the stream sends events or its
// 25-second heartbeat. This keeps active SSE alive beyond WriteTimeout while
// still bounding writes to a client that stops reading.
func resetRemoteWriteDeadline(w http.ResponseWriter) {
	_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(35 * time.Second))
}

// remoteEvent is the single envelope shape both legs exchange: the agent
// stream carries "command"/"presence"/"ended"; the viewer stream carries
// "lines"/"state"/"presence"/"ended". One reused type rather than two, the
// same way agent.Event is a single tagged struct on the daemon side.
type remoteEvent struct {
	Type      string       `json:"type"` // lines|state|command|presence|ended
	Lines     []string     `json:"lines,omitempty"`
	State     *remoteState `json:"state,omitempty"`
	Command   string       `json:"command,omitempty"`
	Connected bool         `json:"connected,omitempty"`
}

// remoteState is a snapshot of the console's tunnels/connection, for the
// viewer's header card. Deliberately not agent.Tunnel/agent.Status verbatim:
// this crosses a public, unauthenticated (code-guarded) endpoint, so it's a
// hand-picked, display-only subset.
type remoteState struct {
	Online  bool           `json:"online"`
	Edge    string         `json:"edge"`
	Tunnels []remoteTunnel `json:"tunnels"`
}

type remoteTunnel struct {
	ID        string `json:"id"`
	PublicURL string `json:"public_url"`
	LocalAddr string `json:"local_addr"`
	Status    string `json:"status"`
	Requests  int64  `json:"requests"`
}

// --- hub ---

type remoteHub struct {
	mu       sync.Mutex
	sessions map[string]*remoteSession
}

func newRemoteHub() *remoteHub {
	h := &remoteHub{sessions: make(map[string]*remoteSession)}
	go h.sweepLoop()
	return h
}

// create opens a session for orgID, or returns nil when the org already holds
// remoteMaxSessionsOrg live ones. A code collision (vanishingly unlikely at
// ~58 bits) is retried rather than overwriting another live session.
func (h *remoteHub) create(orgID string) *remoteSession {
	now := time.Now()
	h.mu.Lock()
	defer h.mu.Unlock()
	live := 0
	for _, s := range h.sessions {
		if s.orgID == orgID && now.Before(s.expiresAt) {
			live++
		}
	}
	if live >= remoteMaxSessionsOrg {
		return nil
	}
	code := newRemoteCode()
	for h.sessions[code] != nil {
		code = newRemoteCode()
	}
	s := &remoteSession{
		code:      code,
		orgID:     orgID,
		createdAt: now,
		expiresAt: now.Add(remoteSessionTTL),
		viewers:   make(map[int]chan remoteEvent),
	}
	h.sessions[s.code] = s
	return s
}

// get returns the session for code, or nil if it doesn't exist or has
// expired (lazily reaped here, same pattern as the device store's Poll).
// The code is canonicalized first, so a phone keyboard's lowercase or a
// code typed without dashes still resolves.
func (h *remoteHub) get(code string) *remoteSession {
	code, ok := canonicalRemoteCode(code)
	if !ok {
		return nil
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	s := h.sessions[code]
	if s == nil {
		return nil
	}
	if time.Now().After(s.expiresAt) {
		delete(h.sessions, code)
		return nil
	}
	return s
}

// end removes and tears down a session immediately (explicit /qr stop, or
// the creating daemon disconnecting for good).
func (h *remoteHub) end(code string) {
	h.mu.Lock()
	s := h.sessions[code]
	delete(h.sessions, code)
	h.mu.Unlock()
	if s != nil {
		s.endSession()
	}
}

// sweepLoop reaps expired sessions a caller never explicitly ended.
func (h *remoteHub) sweepLoop() {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for range t.C {
		now := time.Now()
		var expired []*remoteSession
		h.mu.Lock()
		for code, s := range h.sessions {
			if now.After(s.expiresAt) {
				expired = append(expired, s)
				delete(h.sessions, code)
			}
		}
		h.mu.Unlock()
		for _, s := range expired {
			s.endSession()
		}
	}
}

// --- session ---

type remoteSession struct {
	code      string
	orgID     string
	createdAt time.Time
	expiresAt time.Time

	mu             sync.Mutex
	agentCh        chan remoteEvent
	agentConnected bool
	viewers        map[int]chan remoteEvent
	nextViewer     int
	backlog        []string
	state          *remoteState
	ended          bool
}

// attachAgent registers the (single) daemon connection, replacing any prior
// one — an agent reconnecting after a network blip keeps the same session
// rather than orphaning it.
func (s *remoteSession) attachAgent() (chan remoteEvent, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.ended {
		return nil, false
	}
	ch := make(chan remoteEvent, 32)
	s.agentCh = ch
	s.agentConnected = true
	s.broadcastViewersLocked(remoteEvent{Type: "presence", Connected: true})
	return ch, true
}

// detachAgent unregisters ch if it's still the current agent connection (a
// stale detach from a since-superseded reconnect is a no-op).
func (s *remoteSession) detachAgent(ch chan remoteEvent) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.agentCh != ch {
		return
	}
	s.agentCh = nil
	s.agentConnected = false
	s.broadcastViewersLocked(remoteEvent{Type: "presence", Connected: false})
}

// addViewer registers a new phone/browser connection and replays recent
// context (backlog + last known state + current presence) so it isn't
// staring at a blank page. It refuses (false) once the session has ended —
// a viewer registered after endSession would never be closed — or when the
// session already has remoteMaxViewers streams.
func (s *remoteSession) addViewer() (int, chan remoteEvent, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.ended || len(s.viewers) >= remoteMaxViewers {
		return 0, nil, false
	}
	id := s.nextViewer
	s.nextViewer++
	ch := make(chan remoteEvent, 32)
	s.viewers[id] = ch
	if len(s.backlog) > 0 {
		ch <- remoteEvent{Type: "lines", Lines: append([]string(nil), s.backlog...)}
	}
	if s.state != nil {
		ch <- remoteEvent{Type: "state", State: s.state}
	}
	ch <- remoteEvent{Type: "presence", Connected: s.agentConnected}
	return id, ch, true
}

func (s *remoteSession) removeViewer(id int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if ch, ok := s.viewers[id]; ok {
		delete(s.viewers, id)
		close(ch)
	}
}

// publish is the agent side pushing transcript lines / a state snapshot: it
// updates the replay backlog and fans the event out to every viewer.
func (s *remoteSession) publish(ev remoteEvent) {
	s.mu.Lock()
	defer s.mu.Unlock()
	switch ev.Type {
	case "lines":
		s.backlog = append(s.backlog, ev.Lines...)
		if n := len(s.backlog); n > remoteBacklogLimit {
			s.backlog = s.backlog[n-remoteBacklogLimit:]
		}
	case "state":
		s.state = ev.State
	}
	s.broadcastViewersLocked(ev)
}

func (s *remoteSession) broadcastViewersLocked(ev remoteEvent) {
	for _, ch := range s.viewers {
		select {
		case ch <- ev:
		default: // a stalled viewer drops a frame rather than blocking the fan-out
		}
	}
}

// command is the viewer side sending a typed/tapped command: forwarded to
// the attached agent if one is connected. Reports whether it was delivered.
func (s *remoteSession) command(text string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.agentCh == nil {
		return false
	}
	select {
	case s.agentCh <- remoteEvent{Type: "command", Command: text}:
		return true
	default:
		return false
	}
}

// endSession notifies both legs and closes every viewer channel. Safe to
// call more than once (the second call is a no-op).
func (s *remoteSession) endSession() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.ended {
		return
	}
	s.ended = true
	s.broadcastViewersLocked(remoteEvent{Type: "ended"})
	if s.agentCh != nil {
		select {
		case s.agentCh <- remoteEvent{Type: "ended"}:
		default:
		}
	}
	for id, ch := range s.viewers {
		delete(s.viewers, id)
		close(ch)
	}
}

// newRemoteCode returns a fresh pairing code: three dash-separated groups
// from a no-vowel, no-ambiguous-character alphabet (same alphabet as the
// device flow's user_code), ~58 bits of entropy — enough to resist online
// guessing over a 30-minute TTL even before the shared /v1 rate limiter,
// while still short enough to type by hand if the camera can't scan.
func newRemoteCode() string {
	// 240 = 8 × 30 is the largest multiple of the alphabet size that fits in a
	// byte; bytes at or above it are rejected so every character is uniform
	// (a plain `% 30` would favor the first 16 characters).
	const limit = 240
	raw := make([]byte, 0, remoteCodeChars)
	buf := make([]byte, 24)
	for len(raw) < remoteCodeChars {
		if _, err := rand.Read(buf); err != nil {
			// crypto/rand failing means no safe code can be made; an all-zero
			// predictable code must never reach a client.
			panic("remote: crypto/rand unavailable: " + err.Error())
		}
		for _, c := range buf {
			if c < limit && len(raw) < remoteCodeChars {
				raw = append(raw, remoteCodeAlphabet[int(c)%len(remoteCodeAlphabet)])
			}
		}
	}
	return formatRemoteCode(raw)
}

const (
	remoteCodeAlphabet = "BCDFGHJKLMNPQRSTVWXZ0123456789"
	remoteCodeChars    = 12
)

func formatRemoteCode(raw []byte) string {
	out := make([]byte, 0, remoteCodeChars+2)
	for i, c := range raw {
		if i > 0 && i%4 == 0 {
			out = append(out, '-')
		}
		out = append(out, c)
	}
	return string(out)
}

// canonicalRemoteCode normalizes what a person typed or a link carried
// (any case, optional dashes/spaces) to the stored XXXX-XXXX-XXXX form, and
// reports false for anything that could not be a code — so malformed input
// never even reaches the session map.
func canonicalRemoteCode(in string) (string, bool) {
	if len(in) > 32 {
		return "", false
	}
	raw := make([]byte, 0, remoteCodeChars)
	for i := 0; i < len(in); i++ {
		c := in[i]
		switch {
		case c == '-' || c == ' ':
			continue
		case c >= 'a' && c <= 'z':
			c -= 'a' - 'A'
		}
		if strings.IndexByte(remoteCodeAlphabet, c) < 0 {
			return "", false
		}
		raw = append(raw, c)
	}
	if len(raw) != remoteCodeChars {
		return "", false
	}
	return formatRemoteCode(raw), true
}

// cleanRemoteText drops control characters (ESC, CSI, C1, DEL, newlines…) and
// invalid UTF-8 from text that will be shown in a terminal or browser, keeping
// tabs as spaces. Terminal escape sequences smuggled through a relayed
// command or line are the concern; max truncates (in bytes, on a rune
// boundary) when > 0.
func cleanRemoteText(s string, max int) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r == '\t':
			r = ' '
		case r < 0x20 || (r >= 0x7f && r < 0xa0) || r == utf8.RuneError:
			continue
		case r == ' ' || r == ' ' || (r >= 0x202a && r <= 0x202e) || (r >= 0x2066 && r <= 0x2069):
			continue // line separators and bidi overrides: spoof what a line says
		}
		if max > 0 && b.Len()+utf8.RuneLen(r) > max {
			break
		}
		b.WriteRune(r)
	}
	return b.String()
}

// cleanRemoteURL keeps only absolute http(s) URLs: the viewer renders this as
// a link, and a javascript:/data: URL there would run in the viewer origin.
func cleanRemoteURL(raw string) string {
	raw = cleanRemoteText(raw, remoteMaxStateFieldLen)
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return ""
	}
	return raw
}

// sanitizeRemoteEvent rebuilds an agent publish from scratch, copying only the
// fields a publish may carry and bounding each. Anything else in the body
// (command, connected, unknown fields) is discarded, so an agent can't forge a
// presence or command frame to viewers.
func sanitizeRemoteEvent(ev remoteEvent) (remoteEvent, bool) {
	switch ev.Type {
	case "lines":
		if len(ev.Lines) > remoteMaxPublishLines {
			ev.Lines = ev.Lines[len(ev.Lines)-remoteMaxPublishLines:]
		}
		out := remoteEvent{Type: "lines", Lines: make([]string, 0, len(ev.Lines))}
		for _, l := range ev.Lines {
			out.Lines = append(out.Lines, cleanRemoteText(l, remoteMaxLineBytes))
		}
		return out, true
	case "state":
		if ev.State == nil {
			return remoteEvent{}, false
		}
		st := &remoteState{
			Online:  ev.State.Online,
			Edge:    cleanRemoteText(ev.State.Edge, remoteMaxStateFieldLen),
			Tunnels: make([]remoteTunnel, 0, min(len(ev.State.Tunnels), remoteMaxTunnels)),
		}
		for i, t := range ev.State.Tunnels {
			if i >= remoteMaxTunnels {
				break
			}
			st.Tunnels = append(st.Tunnels, remoteTunnel{
				ID:        cleanRemoteText(t.ID, remoteMaxStateFieldLen),
				PublicURL: cleanRemoteURL(t.PublicURL),
				LocalAddr: cleanRemoteText(t.LocalAddr, remoteMaxStateFieldLen),
				Status:    cleanRemoteText(t.Status, remoteMaxStateFieldLen),
				Requests:  max(t.Requests, 0),
			})
		}
		return remoteEvent{Type: "state", State: st}, true
	}
	return remoteEvent{}, false
}

// --- handlers: agent side (authenticated — JWT or API key) ---

func (s *Server) handleRemoteCreate(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	sess := s.remote.create(p.OrgID)
	if sess == nil {
		writeError(w, http.StatusTooManyRequests, "too many active pairing sessions; end one with /qr stop")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"code":       sess.code,
		"url":        s.qrBase() + "/" + sess.code,
		"expires_at": sess.expiresAt,
	})
}

// remoteSessionForAgent resolves {code} and checks it belongs to the caller's
// org, writing a response and returning nil if not.
func (s *Server) remoteSessionForAgent(w http.ResponseWriter, r *http.Request) *remoteSession {
	p, _ := auth.PrincipalFrom(r.Context())
	sess := s.remote.get(chi.URLParam(r, "code"))
	if sess == nil || p.OrgID == "" || sess.orgID != p.OrgID {
		writeError(w, http.StatusNotFound, "no such session")
		return nil
	}
	return sess
}

func (s *Server) handleRemoteAgentStream(w http.ResponseWriter, r *http.Request) {
	sess := s.remoteSessionForAgent(w, r)
	if sess == nil {
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	// The daemon treats the response headers as its readiness signal. Attach
	// before flushing them so a viewer connecting immediately sees it online.
	ch, ok := sess.attachAgent()
	if !ok {
		writeError(w, http.StatusNotFound, "no such session")
		return
	}
	defer sess.detachAgent(ch)

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	resetRemoteWriteDeadline(w)
	_, _ = io.WriteString(w, ": connected\n\n")
	flusher.Flush()

	keepalive := time.NewTicker(25 * time.Second)
	defer keepalive.Stop()

	enc := json.NewEncoder(w)
	for {
		select {
		case <-r.Context().Done():
			return
		case <-keepalive.C:
			resetRemoteWriteDeadline(w)
			_, _ = io.WriteString(w, ": keepalive\n\n")
			flusher.Flush()
		case ev, ok := <-ch:
			if !ok {
				return
			}
			resetRemoteWriteDeadline(w)
			_, _ = w.Write([]byte("data: "))
			_ = enc.Encode(ev)
			_, _ = w.Write([]byte("\n"))
			flusher.Flush()
			if ev.Type == "ended" {
				return
			}
		}
	}
}

func (s *Server) handleRemotePublish(w http.ResponseWriter, r *http.Request) {
	sess := s.remoteSessionForAgent(w, r)
	if sess == nil {
		return
	}
	var ev remoteEvent
	if !decode(w, r, &ev) {
		return
	}
	clean, ok := sanitizeRemoteEvent(ev)
	if !ok {
		writeError(w, http.StatusBadRequest, "type must be lines or state, with a valid payload")
		return
	}
	sess.publish(clean)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleRemoteEnd(w http.ResponseWriter, r *http.Request) {
	sess := s.remoteSessionForAgent(w, r)
	if sess == nil {
		return
	}
	s.remote.end(sess.code)
	w.WriteHeader(http.StatusNoContent)
}

// --- handlers: viewer side (public — the code itself is the capability) ---

func (s *Server) handleRemoteViewerStream(w http.ResponseWriter, r *http.Request) {
	sess := s.remote.get(chi.URLParam(r, "code"))
	if sess == nil {
		writeError(w, http.StatusNotFound, "session not found or expired")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	id, ch, ok := sess.addViewer()
	if !ok {
		writeError(w, http.StatusTooManyRequests, "session is full or has ended")
		return
	}
	defer sess.removeViewer(id)

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	resetRemoteWriteDeadline(w)
	_, _ = io.WriteString(w, ": connected\n\n")
	flusher.Flush()

	keepalive := time.NewTicker(25 * time.Second)
	defer keepalive.Stop()

	enc := json.NewEncoder(w)
	for {
		select {
		case <-r.Context().Done():
			return
		case <-keepalive.C:
			resetRemoteWriteDeadline(w)
			_, _ = io.WriteString(w, ": keepalive\n\n")
			flusher.Flush()
		case ev, ok := <-ch:
			if !ok {
				return
			}
			resetRemoteWriteDeadline(w)
			_, _ = w.Write([]byte("data: "))
			_ = enc.Encode(ev)
			_, _ = w.Write([]byte("\n"))
			flusher.Flush()
			if ev.Type == "ended" {
				return
			}
		}
	}
}

func (s *Server) handleRemoteCommand(w http.ResponseWriter, r *http.Request) {
	sess := s.remote.get(chi.URLParam(r, "code"))
	if sess == nil {
		writeError(w, http.StatusNotFound, "session not found or expired")
		return
	}
	var req struct {
		Text string `json:"text"`
	}
	if !decode(w, r, &req) {
		return
	}
	// Control characters (ESC/OSC sequences, newlines) never belong in a typed
	// command: the console echoes it into the user's terminal, so refuse
	// rather than silently rewrite what will run.
	text := strings.TrimSpace(req.Text)
	if text == "" || len(text) > remoteMaxCommandBytes || cleanRemoteText(text, 0) != text {
		writeError(w, http.StatusBadRequest, "text must be 1-240 printable characters")
		return
	}
	if !sess.command(text) {
		writeError(w, http.StatusConflict, "no console currently attached to this session")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// qrBase returns the public /qr pairing origin (no trailing slash).
func (s *Server) qrBase() string {
	if s.cfg.QRURL != "" {
		return strings.TrimRight(s.cfg.QRURL, "/")
	}
	return "https://qr." + s.cfg.BaseDomain
}

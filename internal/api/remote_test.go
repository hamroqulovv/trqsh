package api_test

import (
	"bufio"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
)

// sseClient is a minimal SSE reader for the /remote endpoints' event stream,
// used the same way the TUI's own client.streamEvents consumes the daemon's
// /events: scan for "data: " lines, ignore comments/keepalives.
type sseClient struct {
	t    *testing.T
	resp *http.Response
	sc   *bufio.Scanner
}

func connectSSE(t *testing.T, url, bearer string) *sseClient {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Accept", "text/event-stream")
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("connect SSE %s: %v", url, err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("connect SSE %s: status %d", url, resp.StatusCode)
	}
	if !strings.Contains(resp.Header.Get("Cache-Control"), "no-transform") {
		t.Fatal("SSE must opt out of proxy compression so events flush immediately")
	}
	c := &sseClient{t: t, resp: resp, sc: bufio.NewScanner(resp.Body)}
	t.Cleanup(func() { _ = resp.Body.Close() })
	return c
}

// next reads events until one decodes successfully, or fails the test after
// within timeout with nothing but comments/keepalives.
func (c *sseClient) next(timeout time.Duration) map[string]any {
	c.t.Helper()
	done := make(chan map[string]any, 1)
	go func() {
		for c.sc.Scan() {
			line := c.sc.Text()
			data, ok := strings.CutPrefix(line, "data: ")
			if !ok {
				continue
			}
			var ev map[string]any
			if json.Unmarshal([]byte(data), &ev) == nil {
				done <- ev
				return
			}
		}
	}()
	select {
	case ev := <-done:
		return ev
	case <-time.After(timeout):
		c.t.Fatalf("timed out waiting for an SSE event")
		return nil
	}
}

// The agent flushes headers before registering with the hub, so the viewer
// may first receive disconnected presence. Wait for registration to complete
// before sending commands or asserting transcript delivery.
func (c *sseClient) waitConnected(timeout time.Duration) {
	c.t.Helper()
	deadline := time.Now().Add(timeout)
	for {
		ev := c.next(time.Until(deadline))
		if ev["type"] != "presence" {
			c.t.Fatalf("expected startup presence, got %#v", ev)
		}
		if ev["connected"] == true {
			return
		}
	}
}

func TestRemotePairingRoundTrip(t *testing.T) {
	ts := testServer(t)
	_, apiKey := signupAndKey(t, ts, "remote-a@example.com")

	var created struct {
		Code      string `json:"code"`
		URL       string `json:"url"`
		ExpiresAt string `json:"expires_at"`
	}
	resp := postJSON(t, ts.URL+"/v1/remote/sessions", apiKey, nil, &created)
	if resp.StatusCode != http.StatusCreated || created.Code == "" {
		t.Fatalf("create session: status %d code %q", resp.StatusCode, created.Code)
	}
	if !strings.Contains(created.URL, created.Code) {
		t.Fatalf("url %q should contain the code %q", created.URL, created.Code)
	}

	agent := connectSSE(t, ts.URL+"/v1/remote/sessions/"+created.Code+"/agent", apiKey)
	viewer := connectSSE(t, ts.URL+"/v1/remote/sessions/"+created.Code+"/viewer", "")

	viewer.waitConnected(3 * time.Second)

	// Agent (daemon) publishes transcript lines; the viewer (phone) sees them.
	pub := postJSON(t, ts.URL+"/v1/remote/sessions/"+created.Code+"/publish", apiKey,
		map[string]any{"type": "lines", "lines": []string{"❯ /ls", "no tunnels"}}, nil)
	if pub.StatusCode != http.StatusNoContent {
		t.Fatalf("publish: status %d", pub.StatusCode)
	}
	ev := viewer.next(3 * time.Second)
	if ev["type"] != "lines" {
		t.Fatalf("expected a lines event, got %#v", ev)
	}
	lines, _ := ev["lines"].([]any)
	if len(lines) != 2 || lines[0] != "❯ /ls" {
		t.Fatalf("unexpected lines payload: %#v", ev["lines"])
	}

	// Viewer (phone) sends a command; the agent (daemon) receives it.
	cmd := postJSON(t, ts.URL+"/v1/remote/sessions/"+created.Code+"/command", "",
		map[string]string{"text": "/status"}, nil)
	if cmd.StatusCode != http.StatusNoContent {
		t.Fatalf("command: status %d", cmd.StatusCode)
	}
	ev = agent.next(3 * time.Second)
	if ev["type"] != "command" || ev["command"] != "/status" {
		t.Fatalf("expected the command to reach the agent, got %#v", ev)
	}

	// A late-joining viewer replays the backlog instead of starting blank.
	late := connectSSE(t, ts.URL+"/v1/remote/sessions/"+created.Code+"/viewer", "")
	ev = late.next(3 * time.Second)
	if ev["type"] != "lines" {
		t.Fatalf("expected the late viewer to be replayed the backlog, got %#v", ev)
	}

	// Ending the session notifies both legs and a fresh viewer gets 404.
	end := postJSON(t, ts.URL+"/v1/remote/sessions/"+created.Code+"/end", apiKey, nil, nil)
	if end.StatusCode != http.StatusNoContent {
		t.Fatalf("end: status %d", end.StatusCode)
	}
	if ev := viewer.next(3 * time.Second); ev["type"] != "ended" {
		t.Fatalf("expected the viewer to see ended, got %#v", ev)
	}
	req, _ := http.NewRequest(http.MethodGet, ts.URL+"/v1/remote/sessions/"+created.Code+"/viewer", nil)
	r2, _ := http.DefaultClient.Do(req)
	if r2.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for an ended session, got %d", r2.StatusCode)
	}
	_ = r2.Body.Close()
}

func TestRemoteStreamSurvivesRESTTimeout(t *testing.T) {
	if testing.Short() {
		t.Skip("checks a connection beyond the 30-second REST deadline")
	}
	ts := testServer(t)
	_, apiKey := signupAndKey(t, ts, "remote-long-lived@example.com")
	var created struct{ Code string }
	postJSON(t, ts.URL+"/v1/remote/sessions", apiKey, nil, &created)
	agent := connectSSE(t, ts.URL+"/v1/remote/sessions/"+created.Code+"/agent", apiKey)
	viewer := connectSSE(t, ts.URL+"/v1/remote/sessions/"+created.Code+"/viewer", "")
	viewer.waitConnected(3 * time.Second)

	time.Sleep(31 * time.Second)
	resp := postJSON(t, ts.URL+"/v1/remote/sessions/"+created.Code+"/command", "",
		map[string]string{"text": "/status"}, nil)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("command after REST timeout: status %d", resp.StatusCode)
	}
	if event := agent.next(3 * time.Second); event["command"] != "/status" {
		t.Fatalf("long-lived agent lost command: %#v", event)
	}
	postJSON(t, ts.URL+"/v1/remote/sessions/"+created.Code+"/publish", apiKey,
		map[string]any{"type": "lines", "lines": []string{"still connected"}}, nil)
	event := viewer.next(3 * time.Second)
	lines, _ := event["lines"].([]any)
	if event["type"] != "lines" || len(lines) != 1 || lines[0] != "still connected" {
		t.Fatalf("long-lived viewer lost transcript: %#v", event)
	}
}

func TestRemoteSessionIsolationAndUnknownCode(t *testing.T) {
	ts := testServer(t)
	_, keyA := signupAndKey(t, ts, "remote-b@example.com")
	_, keyB := signupAndKey(t, ts, "remote-c@example.com")

	var created struct {
		Code string `json:"code"`
	}
	postJSON(t, ts.URL+"/v1/remote/sessions", keyA, nil, &created)

	// A different org's key can't attach as the agent to org A's session.
	req, _ := http.NewRequest(http.MethodGet, ts.URL+"/v1/remote/sessions/"+created.Code+"/agent", nil)
	req.Header.Set("Authorization", "Bearer "+keyB)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("cross-org agent attach should 404, got %d", resp.StatusCode)
	}

	// An unauthenticated create is rejected outright.
	r2 := postJSON(t, ts.URL+"/v1/remote/sessions", "", nil, nil)
	if r2.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 creating without auth, got %d", r2.StatusCode)
	}

	// A made-up viewer code 404s rather than hanging or panicking.
	r3, _ := http.Get(ts.URL + "/v1/remote/sessions/NOPE-NOPE-NOPE/viewer")
	if r3.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown code should 404, got %d", r3.StatusCode)
	}
	_ = r3.Body.Close()

	// Sending a command with nobody attached reports 409, not a silent drop.
	r4 := postJSON(t, ts.URL+"/v1/remote/sessions/"+created.Code+"/command", "",
		map[string]string{"text": "/ls"}, nil)
	if r4.StatusCode != http.StatusConflict {
		t.Fatalf("command with no attached agent should 409, got %d", r4.StatusCode)
	}
}

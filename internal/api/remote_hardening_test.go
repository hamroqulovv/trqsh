package api_test

import (
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestRemoteViewerInputHardening(t *testing.T) {
	ts := testServer(t)
	_, apiKey := signupAndKey(t, ts, "remote-harden@example.com")
	var created struct{ Code string }
	postJSON(t, ts.URL+"/v1/remote/sessions", apiKey, nil, &created)
	agent := connectSSE(t, ts.URL+"/v1/remote/sessions/"+created.Code+"/agent", apiKey)

	// A code typed in lowercase without dashes still reaches the session.
	loose := strings.ToLower(strings.ReplaceAll(created.Code, "-", ""))
	ok := postJSON(t, ts.URL+"/v1/remote/sessions/"+loose+"/command", "", map[string]string{"text": "/ls"}, nil)
	if ok.StatusCode != http.StatusNoContent {
		t.Fatalf("lowercase/dashless code: status %d", ok.StatusCode)
	}
	if ev := agent.next(3 * time.Second); ev["command"] != "/ls" {
		t.Fatalf("command via loose code: %#v", ev)
	}

	// Terminal escape sequences, newlines and oversize text never reach the console.
	for _, text := range []string{"\x1b]52;c;ZXZpbA==\x07", "/ls\n/quit", "/ls\x1b[2J", "   ", strings.Repeat("a", 241)} {
		r := postJSON(t, ts.URL+"/v1/remote/sessions/"+created.Code+"/command", "", map[string]string{"text": text}, nil)
		if r.StatusCode != http.StatusBadRequest {
			t.Fatalf("command %q should be rejected with 400, got %d", text, r.StatusCode)
		}
	}
}

func TestRemotePublishCannotForgeFramesOrLinks(t *testing.T) {
	ts := testServer(t)
	_, apiKey := signupAndKey(t, ts, "remote-forge@example.com")
	var created struct{ Code string }
	postJSON(t, ts.URL+"/v1/remote/sessions", apiKey, nil, &created)
	connectSSE(t, ts.URL+"/v1/remote/sessions/"+created.Code+"/agent", apiKey)
	viewer := connectSSE(t, ts.URL+"/v1/remote/sessions/"+created.Code+"/viewer", "")
	viewer.requireConnected(3 * time.Second)

	// "command" is not a publishable type, and a state's javascript: link is blanked.
	bad := postJSON(t, ts.URL+"/v1/remote/sessions/"+created.Code+"/publish", apiKey,
		map[string]any{"type": "command", "command": "/quit"}, nil)
	if bad.StatusCode != http.StatusBadRequest {
		t.Fatalf("publishing a command frame: status %d", bad.StatusCode)
	}
	postJSON(t, ts.URL+"/v1/remote/sessions/"+created.Code+"/publish", apiKey, map[string]any{
		"type": "state", "state": map[string]any{"online": true, "tunnels": []map[string]any{
			{"id": "t1", "public_url": "javascript:alert(1)", "local_addr": "localhost:3000", "status": "online"},
		}},
	}, nil)
	ev := viewer.next(3 * time.Second)
	state, _ := ev["state"].(map[string]any)
	tunnels, _ := state["tunnels"].([]any)
	if ev["type"] != "state" || len(tunnels) != 1 || tunnels[0].(map[string]any)["public_url"] != "" {
		t.Fatalf("javascript: URL must be blanked before reaching a viewer: %#v", ev)
	}
}

func TestRemoteViewerAndSessionCaps(t *testing.T) {
	ts := testServer(t)
	_, apiKey := signupAndKey(t, ts, "remote-caps@example.com")
	var created struct{ Code string }
	postJSON(t, ts.URL+"/v1/remote/sessions", apiKey, nil, &created)
	for range 16 {
		connectSSE(t, ts.URL+"/v1/remote/sessions/"+created.Code+"/viewer", "")
	}
	resp, err := http.Get(ts.URL + "/v1/remote/sessions/" + created.Code + "/viewer")
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("17th viewer should get 429, got %d", resp.StatusCode)
	}

	for range 9 { // one session exists already; the cap is 10 live per org
		if r := postJSON(t, ts.URL+"/v1/remote/sessions", apiKey, nil, nil); r.StatusCode != http.StatusCreated {
			t.Fatalf("create under the cap: status %d", r.StatusCode)
		}
	}
	if r := postJSON(t, ts.URL+"/v1/remote/sessions", apiKey, nil, nil); r.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("create over the per-org cap should 429, got %d", r.StatusCode)
	}
}

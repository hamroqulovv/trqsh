package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/trqsh-uz/trqsh/internal/api/store"
)

// failingDomains fails the custom-domain list the way an unreachable database would.
type failingDomains struct{ store.Store }

func (failingDomains) ListCustomDomains(context.Context, string) ([]store.CustomDomain, error) {
	return nil, errors.New("database is unavailable")
}

func TestServerErrorsAreLogged(t *testing.T) {
	var logs bytes.Buffer
	cfg := DefaultConfig()
	cfg.DevAuth = true
	s, err := New(cfg, slog.New(slog.NewTextHandler(&logs, nil)))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	s.store = failingDomains{s.store}
	ts := httptest.NewServer(s.Router())
	defer ts.Close()

	resp, err := http.Post(ts.URL+"/v1/auth/signup", "application/json",
		strings.NewReader(`{"email":"logs@example.com","name":"Logs"}`))
	if err != nil {
		t.Fatalf("signup: %v", err)
	}
	var signup struct {
		Tokens struct {
			Access string `json:"access_token"`
		} `json:"tokens"`
	}
	err = json.NewDecoder(resp.Body).Decode(&signup)
	_ = resp.Body.Close()
	if err != nil || signup.Tokens.Access == "" {
		t.Fatalf("signup: no access token (%v)", err)
	}
	get := func(path string) int {
		t.Helper()
		req, _ := http.NewRequest("GET", ts.URL+path, nil)
		req.Header.Set("Authorization", "Bearer "+signup.Tokens.Access)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("GET %s: %v", path, err)
		}
		_ = resp.Body.Close()
		return resp.StatusCode
	}

	// A server error is logged with what the client was told; a 2xx and a 4xx are not.
	if code := get("/v1/domains"); code != http.StatusInternalServerError {
		t.Fatalf("GET /v1/domains = %d, want 500", code)
	}
	if code := get("/v1/subdomains"); code != http.StatusOK {
		t.Fatalf("GET /v1/subdomains = %d, want 200", code)
	}
	if code := get("/v1/no-such-route"); code != http.StatusNotFound {
		t.Fatalf("GET /v1/no-such-route = %d, want 404", code)
	}
	var failures []string
	for line := range strings.SplitSeq(logs.String(), "\n") {
		if strings.Contains(line, `msg="request failed"`) {
			failures = append(failures, line)
		}
	}
	if len(failures) != 1 {
		t.Fatalf("logged %d failed requests, want 1 (the 500):\n%s", len(failures), logs.String())
	}
	for _, want := range []string{"level=ERROR", "method=GET", "route=/v1/domains", "status=500", `error="database is unavailable"`} {
		if !strings.Contains(failures[0], want) {
			t.Errorf("failure log %q is missing %s", failures[0], want)
		}
	}
}

func TestErrorBodyMessage(t *testing.T) {
	for _, tc := range []struct {
		body string
		want string
	}{
		{`{"error":"no such domain"}` + "\n", "no such domain"},
		{"upstream exploded\n", "upstream exploded"},
		{"", "Gateway Timeout"},
	} {
		b := &errorBody{status: func() int { return http.StatusGatewayTimeout }}
		_, _ = b.Write([]byte(tc.body))
		if got := b.message(http.StatusGatewayTimeout); got != tc.want {
			t.Errorf("message(%q) = %q, want %q", tc.body, got, tc.want)
		}
	}
	// Only the start of a large body is kept, and nothing of a successful one.
	big := &errorBody{status: func() int { return http.StatusInternalServerError }}
	_, _ = big.Write(bytes.Repeat([]byte("x"), 4*maxLoggedError))
	if len(big.buf) != maxLoggedError {
		t.Errorf("kept %d bytes, want %d", len(big.buf), maxLoggedError)
	}
	ok := &errorBody{status: func() int { return http.StatusOK }}
	_, _ = ok.Write([]byte(`[{"id":"1"}]`))
	if len(ok.buf) != 0 {
		t.Errorf("kept %d bytes of a 200 response", len(ok.buf))
	}
}

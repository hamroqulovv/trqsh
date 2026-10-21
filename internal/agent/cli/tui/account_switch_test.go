package tui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// fakeAccountDaemon records every key pushed to /login and answers /cloud/me
// for whichever key was pushed last, like the real daemon.
func fakeAccountDaemon(t *testing.T, current string) (*client, *[]string) {
	t.Helper()
	var pushed []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/login":
			pushed = append(pushed, "push")
			w.WriteHeader(http.StatusNoContent)
		case "/logout":
			current = ""
			w.WriteHeader(http.StatusNoContent)
		case "/cloud/me":
			if current == "" {
				http.Error(w, `{"error":"not signed in"}`, http.StatusUnauthorized)
				return
			}
			_, _ = w.Write([]byte(`{"user":{"email":"` + current + `"}}`))
		default:
			w.WriteHeader(http.StatusNoContent)
		}
	}))
	t.Cleanup(srv.Close)
	return newClient(strings.TrimPrefix(srv.URL, "http://"), ""), &pushed
}

// After a browser sign-in as a different account, the console must not push
// the API key it read at startup back into the daemon.
func TestLoginDoesNotRestoreStartupKey(t *testing.T) {
	cl, pushed := fakeAccountDaemon(t, "new@example.com")
	m := newModel(Options{APIKey: "old-startup-key"}, cl)
	next, _ := m.update(loginDoneMsg{ok: true})
	m = next.(model)
	if m.opts.APIKey != "" {
		t.Fatal("startup key still held after sign-in")
	}
	a := m.fetchAccount()().(accountMsg)
	if len(*pushed) != 0 {
		t.Fatalf("fetchAccount re-sent the old key %d time(s)", len(*pushed))
	}
	if a.acct == nil || a.acct.User.Email != "new@example.com" {
		t.Fatalf("account = %+v, want new@example.com", a.acct)
	}
}

// After /logout, a later account refresh must not sign the old key back in.
func TestLogoutForgetsStartupKey(t *testing.T) {
	cl, pushed := fakeAccountDaemon(t, "old@example.com")
	m := newModel(Options{APIKey: "old-startup-key"}, cl)
	if cmd := cmdLogout(&m, []string{"yes"}); cmd != nil {
		_ = cmd()
	}
	if m.opts.APIKey != "" || m.acct != nil || m.authed {
		t.Fatal("logout left account state behind")
	}
	if msg, ok := m.fetchAccount()().(accountMsg); !ok || msg.authed || len(*pushed) != 0 {
		t.Fatal("account refresh after logout signed the old key back in")
	}
}

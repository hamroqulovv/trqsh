package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/trqsh-uz/trqsh/internal/api/auth"
	"github.com/trqsh-uz/trqsh/internal/api/store"
)

func TestEmailOnlyAuthenticationFailsClosed(t *testing.T) {
	for _, cfg := range []Config{DefaultConfig(), {Env: "production", DevAuth: true}} {
		s := &Server{cfg: cfg}
		for _, handler := range []http.HandlerFunc{s.handleSignup, s.handleLogin} {
			w := httptest.NewRecorder()
			handler(w, httptest.NewRequest("POST", "/", strings.NewReader(`{"email":"victim@example.test"}`)))
			if w.Code != http.StatusForbidden {
				t.Fatalf("email-only login allowed: %d", w.Code)
			}
		}
	}
}

func TestProductionProviderDiscoveryWithoutVerboseStatus(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Env = "production"
	cfg.GitHubClientID, cfg.GitHubClientSecret = "test-github-id", "test-github-secret"
	cfg.GoogleClientID, cfg.GoogleClientSecret = "test-google-id", "test-google-secret"
	s, err := New(cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	s.Router().ServeHTTP(w, httptest.NewRequest("GET", "/v1/auth/providers", nil))
	var body struct {
		Providers []string `json:"providers"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || w.Code != 200 || strings.Join(body.Providers, ",") != "github,google" {
		t.Fatalf("public provider discovery: %d %s", w.Code, w.Body)
	}
	if strings.Contains(w.Body.String(), "secret") || strings.Contains(w.Body.String(), "goroutines") {
		t.Fatal("provider discovery exposed internal details")
	}
	w = httptest.NewRecorder()
	s.Router().ServeHTTP(w, httptest.NewRequest("GET", "/status", nil))
	if w.Code != 404 {
		t.Fatal("verbose status became public in production")
	}
}

func TestOAuthCallbackRejectsMissingBindingsBeforeExchange(t *testing.T) {
	for _, missing := range []string{"state", "pkce", "dashboard", "wrong-provider"} {
		t.Run(missing, func(t *testing.T) {
			var requests atomic.Int32
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				requests.Add(1)
				w.WriteHeader(500)
			}))
			defer provider.Close()
			s, err := New(DefaultConfig(), nil)
			if err != nil {
				t.Fatal(err)
			}
			for _, name := range []string{"github", "google"} {
				s.providers[name] = auth.OAuthProvider{Name: name, ClientID: "test", ClientSecret: "test", AuthURL: provider.URL, TokenURL: provider.URL + "/token", UserURL: provider.URL + "/user"}
			}
			start := httptest.NewRecorder()
			s.Router().ServeHTTP(start, httptest.NewRequest("GET", "/v1/auth/oauth/google?dashboard_state="+strings.Repeat("a", 64), nil))
			authorization, err := url.Parse(start.Header().Get("Location"))
			if err != nil {
				t.Fatal(err)
			}
			name := "google"
			if missing == "wrong-provider" {
				name = "github"
			}
			callback := httptest.NewRequest("GET", "/v1/auth/oauth/"+name+"/callback?code=test-code&state="+authorization.Query().Get("state"), nil)
			for _, cookie := range start.Result().Cookies() {
				if cookie.Name == "trqsh_oauth_"+missing {
					continue
				}
				callback.AddCookie(cookie)
			}
			finish := httptest.NewRecorder()
			s.Router().ServeHTTP(finish, callback)
			if finish.Code != 400 || requests.Load() != 0 {
				t.Fatalf("invalid %s binding reached provider: status %d, requests %d", missing, finish.Code, requests.Load())
			}
			users, err := s.store.ListUsers(context.Background(), 10, 0, "")
			if err != nil || len(users) != 0 {
				t.Fatal("invalid callback provisioned a user")
			}
		})
	}
}

func TestOAuthStableIdentityAndNoEmailMerging(t *testing.T) {
	s, err := New(DefaultConfig(), nil)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	first := auth.OAuthUser{Provider: "google", Subject: "google-1", Email: "owner@example.test", Name: "Owner"}
	u, org, err := s.provisionOAuthUser(ctx, first)
	if err != nil {
		t.Fatal(err)
	}
	first.Email = "changed@example.test"
	again, againOrg, err := s.provisionOAuthUser(ctx, first)
	if err != nil || again.ID != u.ID || againOrg.ID != org.ID {
		t.Fatalf("provider identity lost on email change: %v", err)
	}
	for _, profile := range []auth.OAuthUser{
		{Provider: "google", Subject: "google-attacker", Email: u.Email},
		{Provider: "github", Subject: "42", Email: u.Email},
	} {
		if _, _, err := s.provisionOAuthUser(ctx, profile); !errors.Is(err, store.ErrConflict) {
			t.Fatalf("different identity merged by email: %v", err)
		}
	}
	_, _, err = s.provisionUser(ctx, "legacy@example.test", "Legacy", "", "email")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.provisionOAuthUser(ctx, auth.OAuthUser{Provider: "google", Subject: "legacy", Email: "legacy@example.test"}); !errors.Is(err, store.ErrConflict) {
		t.Fatal("unverified legacy email account automatically linked")
	}
	legacy, _, err := s.provisionUser(ctx, "older-oauth@example.test", "Legacy OAuth", "", "github")
	if err != nil {
		t.Fatal(err)
	}
	legacyProfile := auth.OAuthUser{Provider: "github", Subject: "99", Email: legacy.Email}
	if _, _, err := s.provisionOAuthUser(ctx, legacyProfile); !errors.Is(err, store.ErrConflict) {
		t.Fatal("legacy OAuth account claimed using email alone")
	}
	if err := s.store.BindOAuthSubject(ctx, legacy.ID, "github", "99"); err != nil {
		t.Fatal(err)
	}
	bound, _, err := s.provisionOAuthUser(ctx, legacyProfile)
	if err != nil || bound.ID != legacy.ID || bound.OAuthSubject != "99" {
		t.Fatalf("legacy original-provider migration failed: %v", err)
	}
}

func TestProductionOAuthCookiesCannotBeTossedByTenant(t *testing.T) {
	s := &Server{cfg: Config{Env: "production"}}
	w := httptest.NewRecorder()
	s.setStateCookie(w, "state")
	s.setPKCECookie(w, "github.state.verifier", 600)
	s.setNextCookie(w, "/device")
	s.setDashboardStateCookie(w, strings.Repeat("a", 64), 600)
	for _, cookie := range w.Result().Cookies() {
		if !strings.HasPrefix(cookie.Name, "__Host-") || cookie.Domain != "" || cookie.Path != "/" || !cookie.Secure || !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode {
			t.Fatalf("unsafe OAuth cookie: %+v", cookie)
		}
	}
}

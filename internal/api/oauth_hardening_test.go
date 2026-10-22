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

func newTestServer(t *testing.T) *Server {
	t.Helper()
	s, err := New(DefaultConfig(), nil)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func userCount(t *testing.T, s *Server) int {
	t.Helper()
	users, err := s.store.ListUsers(context.Background(), 100, 0, "")
	if err != nil {
		t.Fatal(err)
	}
	return len(users)
}

func TestOAuthStableIdentityAcrossEmailChange(t *testing.T) {
	s := newTestServer(t)
	ctx := context.Background()
	first := auth.OAuthUser{Provider: "google", Subject: "google-1", Email: "owner@example.test", Name: "Owner"}
	u, org, err := s.provisionOAuthUser(ctx, first)
	if err != nil {
		t.Fatal(err)
	}
	first.Email = "changed@example.test"
	again, againOrg, err := s.provisionOAuthUser(ctx, first)
	if err != nil || again.ID != u.ID || againOrg.ID != org.ID || again.Email != "owner@example.test" || userCount(t, s) != 1 {
		t.Fatalf("provider identity lost on email change: %v", err)
	}
}

// One verified email is one account, whichever provider signs in first.
func TestOAuthProvidersShareOneAccountPerEmail(t *testing.T) {
	for _, order := range [][2]string{{"google", "github"}, {"github", "google"}} {
		t.Run(order[0]+"-then-"+order[1], func(t *testing.T) {
			s := newTestServer(t)
			ctx := context.Background()
			subjects := map[string]string{"google": "g-1", "github": "42"}
			profile := func(provider string) auth.OAuthUser {
				return auth.OAuthUser{Provider: provider, Subject: subjects[provider], Email: "owner@example.test", Name: provider + " name"}
			}
			u, org, err := s.provisionOAuthUser(ctx, profile(order[0]))
			if err != nil {
				t.Fatal(err)
			}
			linked, linkedOrg, err := s.provisionOAuthUser(ctx, profile(order[1]))
			if err != nil || linked.ID != u.ID || linkedOrg.ID != org.ID || userCount(t, s) != 1 {
				t.Fatalf("second provider did not join the existing account: %v", err)
			}
			// Both providers keep working afterwards.
			for _, provider := range order {
				again, againOrg, err := s.provisionOAuthUser(ctx, profile(provider))
				if err != nil || again.ID != u.ID || againOrg.ID != org.ID {
					t.Fatalf("%s sign-in after linking: %v", provider, err)
				}
			}
			providers, err := s.store.ListOAuthProviders(ctx, u.ID)
			if err != nil || len(providers) != 2 {
				t.Fatalf("linked providers: %v %v", providers, err)
			}
		})
	}
}

// GitHub's profile is the account profile: Google never takes it over.
func TestGitHubProfileWinsOverGoogle(t *testing.T) {
	const googlePic, githubPic = "https://lh3.googleusercontent.com/a/pic", "https://avatars.githubusercontent.com/u/42"
	google := auth.OAuthUser{Provider: "google", Subject: "g-1", Email: "owner@example.test", Name: "Google Name", AvatarURL: googlePic}
	github := auth.OAuthUser{Provider: "github", Subject: "42", Email: "owner@example.test", Name: "gh-login", AvatarURL: githubPic}

	t.Run("google first", func(t *testing.T) {
		s := newTestServer(t)
		ctx := context.Background()
		if u, _, err := s.provisionOAuthUser(ctx, google); err != nil || u.AvatarURL != googlePic {
			t.Fatalf("google-only account should use its Google picture: %+v %v", u, err)
		}
		if u, _, err := s.provisionOAuthUser(ctx, github); err != nil || u.AvatarURL != githubPic || u.Name != "gh-login" {
			t.Fatalf("linking GitHub did not take the GitHub profile: %+v %v", u, err)
		}
		google.AvatarURL, google.Name = "https://lh3.googleusercontent.com/a/new", "Renamed On Google"
		u, _, err := s.provisionOAuthUser(ctx, google)
		if err != nil || u.AvatarURL != githubPic || u.Name != "gh-login" {
			t.Fatalf("Google sign-in replaced the GitHub profile: %+v %v", u, err)
		}
		stored, err := s.store.GetUser(ctx, u.ID)
		if err != nil || stored.AvatarURL != githubPic || stored.Name != "gh-login" {
			t.Fatalf("GitHub profile not persisted: %+v %v", stored, err)
		}
	})

	t.Run("github first", func(t *testing.T) {
		s := newTestServer(t)
		ctx := context.Background()
		if _, _, err := s.provisionOAuthUser(ctx, github); err != nil {
			t.Fatal(err)
		}
		u, _, err := s.provisionOAuthUser(ctx, google)
		if err != nil || u.AvatarURL != githubPic || u.Name != "gh-login" {
			t.Fatalf("Google sign-in replaced the GitHub profile: %+v %v", u, err)
		}
	})

	t.Run("github picture stays current", func(t *testing.T) {
		s := newTestServer(t)
		ctx := context.Background()
		if _, _, err := s.provisionOAuthUser(ctx, github); err != nil {
			t.Fatal(err)
		}
		github.AvatarURL = "https://avatars.githubusercontent.com/u/42?v=5"
		if u, _, err := s.provisionOAuthUser(ctx, github); err != nil || u.AvatarURL != github.AvatarURL {
			t.Fatalf("new GitHub picture not applied: %+v %v", u, err)
		}
	})

	t.Run("google-only account stays current", func(t *testing.T) {
		s := newTestServer(t)
		ctx := context.Background()
		if _, _, err := s.provisionOAuthUser(ctx, google); err != nil {
			t.Fatal(err)
		}
		google.AvatarURL = "https://lh3.googleusercontent.com/a/newer"
		if u, _, err := s.provisionOAuthUser(ctx, google); err != nil || u.AvatarURL != google.AvatarURL {
			t.Fatalf("new Google picture not applied without a GitHub link: %+v %v", u, err)
		}
	})
}

// A GitHub account whose primary email differs still joins the account it
// shares a verified secondary address with, but never creates one from it.
func TestGitHubVerifiedSecondaryEmailJoinsExistingAccount(t *testing.T) {
	s := newTestServer(t)
	ctx := context.Background()
	u, _, err := s.provisionOAuthUser(ctx, auth.OAuthUser{Provider: "google", Subject: "g-1", Email: "me@gmail.test"})
	if err != nil {
		t.Fatal(err)
	}
	github := auth.OAuthUser{Provider: "github", Subject: "42", Email: "work@corp.test", AlternateEmails: []string{"me@gmail.test"}}
	joined, _, err := s.provisionOAuthUser(ctx, github)
	if err != nil || joined.ID != u.ID || userCount(t, s) != 1 {
		t.Fatalf("secondary verified email did not match: %v", err)
	}
	fresh, _, err := s.provisionOAuthUser(ctx, auth.OAuthUser{Provider: "github", Subject: "77", Email: "new@corp.test", AlternateEmails: []string{"other@corp.test"}})
	if err != nil || fresh.Email != "new@corp.test" {
		t.Fatalf("new account must use the primary email: %+v %v", fresh, err)
	}
}

func TestOAuthLinkingStaysSafe(t *testing.T) {
	s := newTestServer(t)
	ctx := context.Background()
	if _, _, err := s.provisionOAuthUser(ctx, auth.OAuthUser{Provider: "github", Subject: "42", Email: "owner@example.test"}); err != nil {
		t.Fatal(err)
	}
	// A different account from a provider that is already linked cannot take over.
	if _, _, err := s.provisionOAuthUser(ctx, auth.OAuthUser{Provider: "github", Subject: "attacker", Email: "owner@example.test"}); !errors.Is(err, store.ErrConflict) {
		t.Fatalf("second GitHub account joined an account that already has one: %v", err)
	}
	// Different verified emails are different people.
	other, _, err := s.provisionOAuthUser(ctx, auth.OAuthUser{Provider: "google", Subject: "g-2", Email: "someone-else@example.test"})
	if err != nil || userCount(t, s) != 2 {
		t.Fatalf("unrelated email was merged: %+v %v", other, err)
	}
	// Unverified profiles are rejected before any lookup.
	if _, _, err := s.provisionOAuthUser(ctx, auth.OAuthUser{Provider: "google", Subject: "g-3"}); !errors.Is(err, auth.ErrUnverifiedEmail) {
		t.Fatalf("profile without a verified email accepted: %v", err)
	}
}

// Accounts created before provider IDs were stored sign in with their provider
// and join the account by verified email, without a manual operator step.
func TestLegacyAccountsLinkByVerifiedEmail(t *testing.T) {
	s := newTestServer(t)
	ctx := context.Background()
	devUser, _, err := s.provisionUser(ctx, "legacy@example.test", "Legacy", "", "email")
	if err != nil {
		t.Fatal(err)
	}
	if u, _, err := s.provisionOAuthUser(ctx, auth.OAuthUser{Provider: "google", Subject: "legacy", Email: "legacy@example.test"}); err != nil || u.ID != devUser.ID {
		t.Fatalf("email-only account not joined by a verified Google email: %+v %v", u, err)
	}
	older, _, err := s.provisionUser(ctx, "older-oauth@example.test", "Legacy OAuth", "", "github")
	if err != nil {
		t.Fatal(err)
	}
	bound, _, err := s.provisionOAuthUser(ctx, auth.OAuthUser{Provider: "github", Subject: "99", Email: older.Email})
	if err != nil || bound.ID != older.ID || userCount(t, s) != 2 {
		t.Fatalf("legacy original-provider account not migrated: %+v %v", bound, err)
	}
	if stored, err := s.store.GetUser(ctx, older.ID); err != nil || stored.OAuthSubject != "99" {
		t.Fatalf("legacy provider ID not back-filled: %+v %v", stored, err)
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

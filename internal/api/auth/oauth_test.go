package auth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestOAuthVerifiedProviderIdentity(t *testing.T) {
	for _, tc := range []struct {
		name, provider, profile, emails, subject, email string
		wantError                                       bool
	}{
		{"google-verified", "google", `{"sub":"123","email":"Owner@Example.test","email_verified":true}`, "", "123", "owner@example.test", false},
		{"google-unverified", "google", `{"sub":"123","email":"owner@example.test","email_verified":false}`, "", "", "", true},
		{"google-missing-verification", "google", `{"sub":"123","email":"owner@example.test"}`, "", "", "", true},
		{"google-missing-subject", "google", `{"email":"owner@example.test","email_verified":true}`, "", "", "", true},
		{"google-malformed-email", "google", `{"sub":"123","email":"Owner <owner@example.test>","email_verified":true}`, "", "", "", true},
		{"github-private", "github", `{"id":42,"email":null,"login":"owner"}`, `[{"email":"owner@example.test","primary":true,"verified":true}]`, "42", "owner@example.test", false},
		{"github-public-not-trusted", "github", `{"id":42,"email":"victim@example.test"}`, `[{"email":"owner@example.test","primary":true,"verified":true}]`, "42", "owner@example.test", false},
		{"github-unverified-public", "github", `{"id":42,"email":"victim@example.test"}`, `[{"email":"victim@example.test","primary":true,"verified":false}]`, "", "", true},
		{"github-unverified-primary", "github", `{"id":42,"email":"victim@example.test"}`, `[{"email":"victim@example.test","primary":true,"verified":false},{"email":"other@example.test","primary":false,"verified":true}]`, "", "", true},
		{"github-missing-id", "github", `{"email":"victim@example.test"}`, `[]`, "", "", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			verifier := NewPKCEVerifier()
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				switch r.URL.Path {
				case "/token":
					if err := r.ParseForm(); err != nil || r.Form.Get("code_verifier") != verifier || r.Form.Get("redirect_uri") != "https://api.example.test/callback" {
						t.Error("token exchange omitted its PKCE verifier or exact redirect URI")
						w.WriteHeader(400)
						return
					}
					_, _ = w.Write([]byte(`{"access_token":"test-provider-access"}`))
				case "/user", "/emails":
					if r.Header.Get("Authorization") != "Bearer test-provider-access" {
						t.Error("userinfo not authenticated")
					}
					if r.URL.Path == "/user" {
						_, _ = w.Write([]byte(tc.profile))
					} else {
						_, _ = w.Write([]byte(tc.emails))
					}
				default:
					w.WriteHeader(404)
				}
			}))
			defer provider.Close()
			p := OAuthProvider{Name: tc.provider, ClientID: "test", ClientSecret: "test", RedirectURL: "https://api.example.test/callback", TokenURL: provider.URL + "/token", UserURL: provider.URL + "/user", EmailsURL: provider.URL + "/emails"}
			u, err := p.Exchange(context.Background(), "test-code", verifier)
			if (err != nil) != tc.wantError {
				t.Fatalf("profile=%+v error=%v", u, err)
			}
			if !tc.wantError && (u.Subject != tc.subject || u.Email != tc.email) {
				t.Fatalf("wrong identity: %+v", u)
			}
		})
	}
}

func TestOAuthPKCEChallenge(t *testing.T) {
	verifier := NewPKCEVerifier()
	if len(verifier) != 43 || verifier == NewPKCEVerifier() {
		t.Fatal("invalid PKCE entropy")
	}
	p := GitHubProvider("test-id", "test-secret", "https://api.example.test/callback")
	u, err := url.Parse(p.AuthCodeURL("browser-state", verifier))
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256([]byte(verifier))
	if u.Query().Get("code_challenge") != base64.RawURLEncoding.EncodeToString(digest[:]) || u.Query().Get("code_challenge_method") != "S256" || strings.Contains(u.String(), verifier) {
		t.Fatal("PKCE challenge missing or verifier leaked")
	}
	if _, err := p.Exchange(context.Background(), "", verifier); err == nil {
		t.Fatal("empty code accepted")
	}
	if _, err := p.Exchange(context.Background(), "test", ""); err == nil {
		t.Fatal("missing verifier accepted")
	}
}

package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"net/url"
	"strings"
	"time"
)

// OAuthUser is the normalized profile returned by an OAuth provider.
type OAuthUser struct {
	Subject   string
	Email     string
	Name      string
	AvatarURL string
	Provider  string
	// AlternateEmails are the account's other verified addresses (GitHub only).
	// They can match an existing TRQSH account but never create one.
	AlternateEmails []string
}

var ErrUnverifiedEmail = errors.New("oauth: sign-in requires a verified email address")

// OAuthProvider is a configured OAuth2 authorization-code provider.
type OAuthProvider struct {
	Name         string
	ClientID     string
	ClientSecret string
	RedirectURL  string
	AuthURL      string
	TokenURL     string
	UserURL      string
	EmailsURL    string // GitHub's verified-email endpoint (not its public profile).
	Scopes       []string
	// AuthParams are extra query params added to the authorization redirect
	// (e.g. Google's prompt=select_account so a fresh account can be chosen).
	AuthParams map[string]string
}

// GitHubProvider builds a GitHub OAuth provider from credentials.
func GitHubProvider(clientID, clientSecret, redirectURL string) OAuthProvider {
	return OAuthProvider{ // #nosec G101 -- public OAuth endpoint URLs below; ClientSecret comes from a parameter, not a literal
		Name: "github", ClientID: clientID, ClientSecret: clientSecret, RedirectURL: redirectURL,
		AuthURL:   "https://github.com/login/oauth/authorize",
		TokenURL:  "https://github.com/login/oauth/access_token",
		UserURL:   "https://api.github.com/user",
		EmailsURL: "https://api.github.com/user/emails",
		Scopes:    []string{"read:user", "user:email"},
	}
}

// GoogleProvider builds a Google OAuth provider from credentials.
func GoogleProvider(clientID, clientSecret, redirectURL string) OAuthProvider {
	return OAuthProvider{ // #nosec G101 -- public OAuth endpoint URLs below; ClientSecret comes from a parameter, not a literal
		Name: "google", ClientID: clientID, ClientSecret: clientSecret, RedirectURL: redirectURL,
		AuthURL:    "https://accounts.google.com/o/oauth2/v2/auth",
		TokenURL:   "https://oauth2.googleapis.com/token",
		UserURL:    "https://openidconnect.googleapis.com/v1/userinfo",
		Scopes:     []string{"openid", "email", "profile"},
		AuthParams: map[string]string{"prompt": "select_account"},
	}
}

// Configured reports whether the provider has credentials.
func (p OAuthProvider) Configured() bool {
	return p.ClientID != "" && p.ClientSecret != ""
}

// AuthCodeURL builds the authorization redirect URL for a state token.
func (p OAuthProvider) AuthCodeURL(state, verifier string) string {
	q := url.Values{}
	q.Set("client_id", p.ClientID)
	q.Set("redirect_uri", p.RedirectURL)
	q.Set("response_type", "code")
	q.Set("scope", strings.Join(p.Scopes, " "))
	q.Set("state", state)
	challenge := sha256.Sum256([]byte(verifier))
	q.Set("code_challenge", base64.RawURLEncoding.EncodeToString(challenge[:]))
	q.Set("code_challenge_method", "S256")
	for k, v := range p.AuthParams {
		q.Set(k, v)
	}
	return p.AuthURL + "?" + q.Encode()
}

// Exchange swaps an authorization code for the user's profile.
func (p OAuthProvider) Exchange(ctx context.Context, code, verifier string) (OAuthUser, error) {
	if code == "" || len(code) > 4096 || len(verifier) != 43 {
		return OAuthUser{}, errors.New("oauth: invalid authorization code or PKCE verifier")
	}
	token, err := p.exchangeToken(ctx, code, verifier)
	if err != nil {
		return OAuthUser{}, err
	}
	return p.fetchUser(ctx, token)
}

func (p OAuthProvider) exchangeToken(ctx context.Context, code, verifier string) (string, error) {
	form := url.Values{}
	form.Set("client_id", p.ClientID)
	form.Set("client_secret", p.ClientSecret)
	form.Set("code", code)
	form.Set("redirect_uri", p.RedirectURL)
	form.Set("grant_type", "authorization_code")
	form.Set("code_verifier", verifier)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := httpClient().Do(req)
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("oauth token exchange: status %d", resp.StatusCode)
	}
	var tok struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(body, &tok); err != nil || tok.AccessToken == "" {
		return "", fmt.Errorf("oauth token exchange: no access_token")
	}
	return tok.AccessToken, nil
}

func (p OAuthProvider) fetchUser(ctx context.Context, accessToken string) (OAuthUser, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.UserURL, nil)
	if err != nil {
		return OAuthUser{}, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")

	resp, err := httpClient().Do(req)
	if err != nil {
		return OAuthUser{}, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return OAuthUser{}, fmt.Errorf("oauth userinfo: status %d", resp.StatusCode)
	}
	var raw struct {
		ID      json.Number `json:"id"`
		Subject string      `json:"sub"`
		Email   string      `json:"email"`
		Name    string      `json:"name"`
		Login   string      `json:"login"`
		Avatar  string      `json:"avatar_url"`
		Picture string      `json:"picture"`
		// Absence is not proof of verification. GitHub is checked separately
		// against /user/emails, even when /user includes a public email.
		VerifiedEmail *bool `json:"verified_email"`
		EmailVerified *bool `json:"email_verified"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&raw); err != nil {
		return OAuthUser{}, err
	}
	name := raw.Name
	if name == "" {
		name = raw.Login
	}
	avatar := raw.Avatar
	if avatar == "" {
		avatar = raw.Picture
	}
	subject := raw.Subject
	var alternates []string
	switch p.Name {
	case "github":
		subject = raw.ID.String()
		if id, err := raw.ID.Int64(); err != nil || id <= 0 {
			return OAuthUser{}, errors.New("oauth userinfo: missing GitHub identity")
		}
		// Public-profile emails carry no verification flag. Always ask GitHub
		// for its verified primary email; never trust the profile address alone.
		raw.Email, alternates, err = p.fetchGitHubEmails(ctx, accessToken)
		if err != nil {
			return OAuthUser{}, err
		}
	case "google":
		if subject == "" {
			return OAuthUser{}, errors.New("oauth userinfo: missing Google identity")
		}
		if raw.EmailVerified == nil || !*raw.EmailVerified || (raw.VerifiedEmail != nil && !*raw.VerifiedEmail) {
			return OAuthUser{}, ErrUnverifiedEmail
		}
	default:
		return OAuthUser{}, errors.New("oauth: unsupported provider")
	}
	raw.Email = strings.ToLower(strings.TrimSpace(raw.Email))
	address, err := mail.ParseAddress(raw.Email)
	if err != nil || address.Address != raw.Email || !strings.Contains(raw.Email, "@") {
		return OAuthUser{}, ErrUnverifiedEmail
	}
	return OAuthUser{Subject: subject, Email: raw.Email, Name: name, AvatarURL: avatar, Provider: p.Name, AlternateEmails: alternates}, nil
}

// maxAlternateEmails bounds how many secondary addresses are used for account lookup.
const maxAlternateEmails = 10

// fetchGitHubEmails returns the account's primary verified email, plus its other
// verified addresses, via the user:email scope. A public profile address alone
// never proves verification, and unverified addresses are never returned.
func (p OAuthProvider) fetchGitHubEmails(ctx context.Context, accessToken string) (string, []string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.EmailsURL, nil)
	if err != nil {
		return "", nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")

	resp, err := httpClient().Do(req)
	if err != nil {
		return "", nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return "", nil, fmt.Errorf("oauth userinfo: emails status %d", resp.StatusCode)
	}
	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&emails); err != nil {
		return "", nil, err
	}
	primary := ""
	for _, e := range emails {
		if e.Verified && e.Primary {
			primary = strings.ToLower(strings.TrimSpace(e.Email))
			break
		}
	}
	if primary == "" {
		return "", nil, ErrUnverifiedEmail
	}
	var others []string
	for _, e := range emails {
		addr := strings.ToLower(strings.TrimSpace(e.Email))
		if !e.Verified || e.Primary || addr == primary || len(others) == maxAlternateEmails {
			continue
		}
		if parsed, err := mail.ParseAddress(addr); err == nil && parsed.Address == addr {
			others = append(others, addr)
		}
	}
	return primary, others, nil
}

// NewPKCEVerifier returns an independent, cryptographically random RFC 7636
// verifier. Only its SHA-256 challenge is sent in the authorization URL.
func NewPKCEVerifier() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func httpClient() *http.Client { return &http.Client{Timeout: 15 * time.Second} }

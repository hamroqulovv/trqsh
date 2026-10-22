package api

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/trqsh-uz/trqsh/internal/api/auth"
	"github.com/trqsh-uz/trqsh/internal/api/store"
)

type signupRequest struct {
	Email string `json:"email"`
	Name  string `json:"name"`
}

type authResponse struct {
	User   store.User  `json:"user"`
	Org    store.Org   `json:"org"`
	Tokens auth.Tokens `json:"tokens"`
}

func (s *Server) handleSignup(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.DevAuth || s.cfg.IsProduction() {
		writeError(w, http.StatusForbidden, "password-less signup is disabled; use OAuth")
		return
	}
	var req signupRequest
	if !decode(w, r, &req) {
		return
	}
	if !strings.Contains(req.Email, "@") {
		writeError(w, http.StatusBadRequest, "valid email required")
		return
	}
	if _, err := s.store.GetUserByEmail(r.Context(), req.Email); err == nil {
		writeError(w, http.StatusConflict, "user already exists")
		return
	}
	u, org, err := s.provisionUser(r.Context(), req.Email, req.Name, "", "email")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tokens, err := s.auth.IssueTokens(u.ID, org.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, authResponse{User: u, Org: org, Tokens: tokens})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.DevAuth || s.cfg.IsProduction() {
		writeError(w, http.StatusForbidden, "password-less login is disabled; use OAuth")
		return
	}
	var req signupRequest
	if !decode(w, r, &req) {
		return
	}
	u, err := s.store.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "no such user")
		return
	}
	if u.DisabledAt != nil {
		writeError(w, http.StatusForbidden, "this account is suspended")
		return
	}
	org, err := s.firstOrg(r.Context(), u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tokens, err := s.auth.IssueTokens(u.ID, org.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, authResponse{User: u, Org: org, Tokens: tokens})
}

func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if !decode(w, r, &req) {
		return
	}
	// A suspended or deleted account must not mint new sessions. Already-issued
	// access tokens still expire on their own (see auth/revoke.go).
	if claims, perr := s.auth.ParseToken(req.RefreshToken); perr == nil {
		switch ok, uerr := s.userCanSignIn(r.Context(), claims.Subject); {
		case uerr != nil:
			writeError(w, http.StatusServiceUnavailable, "could not verify account")
			return
		case !ok:
			writeError(w, http.StatusUnauthorized, "invalid refresh token")
			return
		}
	}
	tokens, err := s.auth.Refresh(req.RefreshToken)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid refresh token")
		return
	}
	writeJSON(w, http.StatusOK, tokens)
}

func (s *Server) handleAccount(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	u, err := s.store.GetUser(r.Context(), p.UserID)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	orgs, _ := s.store.OrgsForUser(r.Context(), p.UserID)
	providers, _ := s.store.ListOAuthProviders(r.Context(), p.UserID)
	writeJSON(w, http.StatusOK, map[string]any{"user": u, "orgs": orgs, "active_org": p.OrgID, "providers": providers})
}

// --- OAuth ---

// Provider discovery is public in production and contains no runtime details
// or credentials. The verbose /status endpoint intentionally stays dev-only.
func (s *Server) handleOAuthProviders(w http.ResponseWriter, _ *http.Request) {
	providers := make([]string, 0, len(s.providers))
	for name, provider := range s.providers {
		if provider.Configured() {
			providers = append(providers, name)
		}
	}
	sort.Strings(providers)
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{"providers": providers})
}

func (s *Server) handleOAuthStart(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	name := chi.URLParam(r, "provider")
	p, ok := s.providers[name]
	if !ok || !p.Configured() {
		writeError(w, http.StatusNotFound, "provider not configured")
		return
	}
	// Bootstrap on the dashboard first to bind the exchange to that browser.
	dashboardState := r.URL.Query().Get("dashboard_state")
	if !validDashboardState(dashboardState) {
		dest := s.appBase() + "/login/oauth/" + url.PathEscape(name)
		if next := safeNextPath(r.URL.Query().Get("next")); next != "" {
			dest += "?next=" + url.QueryEscape(next)
		}
		http.Redirect(w, r, dest, http.StatusFound)
		return
	}
	s.setDashboardStateCookie(w, dashboardState, 600)
	// Preserve the destination, including a pending desktop device approval.
	next := safeNextPath(r.URL.Query().Get("next"))
	if next == "" {
		next = "/"
	}
	s.setNextCookie(w, next)
	state := s.newState()
	s.setStateCookie(w, state)
	verifier := auth.NewPKCEVerifier()
	s.setPKCECookie(w, name+"."+state+"."+verifier, 600)
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	http.Redirect(w, r, p.AuthCodeURL(state, verifier), http.StatusFound)
}

// handleLogout clears the API's host-only session cookies so another account can sign
// in, and revokes the refresh token server-side so it can't mint new access
// tokens even if it was captured before logout. The access token is short-lived
// (1h) and expires on its own.
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if rt := refreshTokenFromRequest(r); rt != "" {
		s.auth.RevokeRefresh(rt)
	}
	s.clearSessionCookies(w)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// refreshTokenFromRequest pulls the refresh token from the host-only cookie
// (browser) or, failing that, a JSON {refresh_token} body (programmatic clients).
func refreshTokenFromRequest(r *http.Request) string {
	if c, err := r.Cookie("__Host-trqsh_refresh"); err == nil && c.Value != "" {
		return c.Value
	}
	if c, err := r.Cookie("trqsh_refresh"); err == nil && c.Value != "" {
		return c.Value
	}
	if r.Body == nil {
		return ""
	}
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	_ = json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&body)
	return body.RefreshToken
}

func (s *Server) handleOAuthCallback(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	name := chi.URLParam(r, "provider")
	p, ok := s.providers[name]
	if !ok || !p.Configured() {
		writeError(w, http.StatusNotFound, "provider not configured")
		return
	}
	// CSRF: the returned state must match BOTH the server-issued single-use state
	// and the state cookie set on this browser when the flow started (double-submit).
	qstate := r.URL.Query().Get("state")
	sc, _ := r.Cookie(s.sessionCookieName("trqsh_oauth_state"))
	pc, _ := r.Cookie(s.sessionCookieName("trqsh_oauth_pkce"))
	s.clearStateCookie(w)
	s.setPKCECookie(w, "", -1)
	if sc == nil || qstate == "" || subtle.ConstantTimeCompare([]byte(sc.Value), []byte(qstate)) != 1 || !s.checkState(qstate) {
		writeError(w, http.StatusBadRequest, "invalid state")
		return
	}
	var proof []string
	if pc != nil {
		proof = strings.Split(pc.Value, ".")
	}
	if len(proof) != 3 || proof[0] != name || proof[1] != qstate || len(proof[2]) != 43 {
		writeError(w, http.StatusBadRequest, "invalid OAuth browser proof")
		return
	}
	dashboardState, err := r.Cookie(s.sessionCookieName("trqsh_oauth_dashboard"))
	s.setDashboardStateCookie(w, "", -1)
	if err != nil || !validDashboardState(dashboardState.Value) {
		writeError(w, http.StatusBadRequest, "missing dashboard login state")
		return
	}
	if r.URL.Query().Get("error") != "" {
		http.Redirect(w, r, s.appBase()+"/login?error=oauth_cancelled", http.StatusFound)
		return
	}
	prof, err := p.Exchange(r.Context(), r.URL.Query().Get("code"), proof[2])
	if err != nil {
		failure := "oauth_failed"
		if errors.Is(err, auth.ErrUnverifiedEmail) {
			failure = "verified_email_required"
		}
		http.Redirect(w, r, s.appBase()+"/login?error="+failure, http.StatusFound)
		return
	}
	u, org, err := s.provisionOAuthUser(r.Context(), prof)
	if err != nil {
		if errors.Is(err, store.ErrConflict) {
			http.Redirect(w, r, s.appBase()+"/login?error=provider_mismatch", http.StatusFound)
			return
		}
		writeError(w, http.StatusInternalServerError, "could not complete sign-in")
		return
	}
	if u.DisabledAt != nil {
		http.Redirect(w, r, s.appBase()+"/login?error=account_suspended", http.StatusFound)
		return
	}
	tokens, err := s.auth.IssueTokens(u.ID, org.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	next := "/"
	if nc, _ := r.Cookie(s.sessionCookieName("trqsh_oauth_next")); nc != nil {
		if n := safeNextPath(nc.Value); n != "" {
			next = n
		}
	}
	s.clearNextCookie(w)
	code, err := s.dashboardLogins.issue(r.Context(), dashboardLogin{Tokens: tokens, State: dashboardState.Value, Next: next})
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "login exchange unavailable")
		return
	}
	s.setSessionCookies(w, tokens)
	dest := s.appBase() + "/login/callback?code=" + url.QueryEscape(code) + "&state=" + url.QueryEscape(dashboardState.Value)
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, dest, http.StatusFound) // #nosec G710 -- fixed dashboard callback path; query values are escaped
}

// appBase returns the public dashboard origin (no trailing slash).
func (s *Server) appBase() string {
	if s.cfg.AppURL != "" {
		return strings.TrimRight(s.cfg.AppURL, "/")
	}
	return "https://app." + s.cfg.BaseDomain
}

// safeNextPath accepts only same-site absolute paths (e.g. "/device?code=…"),
// rejecting anything that could redirect off-site.
func safeNextPath(p string) string {
	if p == "" || !strings.HasPrefix(p, "/") || strings.HasPrefix(p, "//") || strings.Contains(p, "\\") ||
		strings.IndexFunc(p, func(c rune) bool { return c <= ' ' || c == 127 }) >= 0 {
		return ""
	}
	return p
}

func (s *Server) setNextCookie(w http.ResponseWriter, next string) {
	// #nosec G124 -- Secure is set below (s.cfg.IsProduction()); gosec's cookie check only recognizes a literal `true`, not a conditional
	http.SetCookie(w, &http.Cookie{
		Name: s.sessionCookieName("trqsh_oauth_next"), Value: next, Path: "/",
		HttpOnly: true, Secure: s.cfg.IsProduction(), SameSite: http.SameSiteLaxMode, MaxAge: 600,
	})
}

func (s *Server) clearNextCookie(w http.ResponseWriter) {
	// #nosec G124 -- Secure is set below (s.cfg.IsProduction()); gosec's cookie check only recognizes a literal `true`, not a conditional
	http.SetCookie(w, &http.Cookie{
		Name: s.sessionCookieName("trqsh_oauth_next"), Value: "", Path: "/",
		HttpOnly: true, Secure: s.cfg.IsProduction(), SameSite: http.SameSiteLaxMode, MaxAge: -1,
	})
}

func (s *Server) setDashboardStateCookie(w http.ResponseWriter, state string, age int) {
	// #nosec G124 -- production requires Secure; development permits local HTTP, matching the other OAuth cookies.
	http.SetCookie(w, &http.Cookie{Name: s.sessionCookieName("trqsh_oauth_dashboard"), Value: state, Path: "/",
		HttpOnly: true, Secure: s.cfg.IsProduction(), SameSite: http.SameSiteLaxMode, MaxAge: age})
}

func (s *Server) sessionCookieName(name string) string {
	if s.cfg.IsProduction() {
		return "__Host-" + name
	}
	return name
}

// Sessions are host-only: tenant subdomains must never receive these tokens.
func (s *Server) setSessionCookies(w http.ResponseWriter, t auth.Tokens) {
	s.clearLegacySessionCookies(w)
	secure := s.cfg.IsProduction()
	// #nosec G124 -- Secure: secure is set from s.cfg.IsProduction() just above; gosec's cookie check only recognizes a literal `true`, not a variable
	http.SetCookie(w, &http.Cookie{
		Name: s.sessionCookieName("trqsh_access"), Value: t.Access, Path: "/",
		HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode, MaxAge: t.ExpiresIn,
	})
	// #nosec G124 -- Secure: secure is set from s.cfg.IsProduction() above; gosec's cookie check only recognizes a literal `true`, not a variable
	http.SetCookie(w, &http.Cookie{
		Name: s.sessionCookieName("trqsh_refresh"), Value: t.Refresh, Path: "/",
		HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode, MaxAge: 30 * 24 * 60 * 60,
	})
}

// Expire credentials from deployments that shared cookies with tenant hosts.
func (s *Server) clearLegacySessionCookies(w http.ResponseWriter) {
	if s.cfg.BaseDomain == "" {
		return
	}
	for _, name := range []string{"trqsh_access", "trqsh_refresh"} {
		// #nosec G124 -- Secure follows the production environment when expiring legacy cookies; HttpOnly and SameSite are explicit.
		http.SetCookie(w, &http.Cookie{Name: name, Path: "/", Domain: "." + s.cfg.BaseDomain,
			HttpOnly: true, Secure: s.cfg.IsProduction(), SameSite: http.SameSiteLaxMode, MaxAge: -1})
	}
}

// clearSessionCookies expires current and legacy cookies (logout).
func (s *Server) clearSessionCookies(w http.ResponseWriter) {
	s.clearLegacySessionCookies(w)
	secure := s.cfg.IsProduction()
	// #nosec G124 -- Secure: secure is set from s.cfg.IsProduction() just above; gosec's cookie check only recognizes a literal `true`, not a variable
	for _, name := range []string{"trqsh_access", "trqsh_refresh"} {
		http.SetCookie(w, &http.Cookie{
			Name: s.sessionCookieName(name), Value: "", Path: "/",
			HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode, MaxAge: -1,
		})
	}
}

// setStateCookie binds the OAuth state to this browser (host-only on the API),
// so a stolen or guessed state alone can't complete the flow.
func (s *Server) setStateCookie(w http.ResponseWriter, state string) {
	// #nosec G124 -- Secure is set below (s.cfg.IsProduction()); gosec's cookie check only recognizes a literal `true`, not a conditional
	http.SetCookie(w, &http.Cookie{
		Name: s.sessionCookieName("trqsh_oauth_state"), Value: state, Path: "/",
		HttpOnly: true, Secure: s.cfg.IsProduction(), SameSite: http.SameSiteLaxMode, MaxAge: 600,
	})
}

func (s *Server) clearStateCookie(w http.ResponseWriter) {
	// #nosec G124 -- Secure is set below (s.cfg.IsProduction()); gosec's cookie check only recognizes a literal `true`, not a conditional
	http.SetCookie(w, &http.Cookie{
		Name: s.sessionCookieName("trqsh_oauth_state"), Value: "", Path: "/",
		HttpOnly: true, Secure: s.cfg.IsProduction(), SameSite: http.SameSiteLaxMode, MaxAge: -1,
	})
}

func (s *Server) setPKCECookie(w http.ResponseWriter, value string, age int) {
	// #nosec G124 -- production enforces Secure and the __Host- prefix; local HTTP is development-only.
	http.SetCookie(w, &http.Cookie{Name: s.sessionCookieName("trqsh_oauth_pkce"), Value: value, Path: "/",
		HttpOnly: true, Secure: s.cfg.IsProduction(), SameSite: http.SameSiteLaxMode, MaxAge: age})
}

func validDashboardState(state string) bool {
	if len(state) != 64 {
		return false
	}
	for _, c := range state {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return true
}

// --- Device flow (CLI/GUI login) ---

func (s *Server) handleDeviceCode(w http.ResponseWriter, r *http.Request) {
	req := s.auth.Devices().Create()
	// The approval page lives on the dashboard (app.<base>/device) where the user
	// already has (or can start) an OAuth session. Fall back to the API's own
	// PublicURL in dev when no dashboard origin is configured.
	verifyBase := s.cfg.AppURL
	if verifyBase == "" {
		verifyBase = s.cfg.PublicURL
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"device_code":               req.DeviceCode,
		"user_code":                 req.UserCode,
		"verification_uri":          verifyBase + "/device",
		"verification_uri_complete": verifyBase + "/device?code=" + req.UserCode,
		"interval":                  2,
		"expires_in":                600,
	})
}

func (s *Server) handleDeviceApprove(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	var req struct {
		UserCode string `json:"user_code"`
	}
	if !decode(w, r, &req) {
		return
	}
	userCode := auth.NormalizeUserCode(req.UserCode)
	// Reject a code that cannot be approved before minting anything: every
	// wrong, expired or already-used code would otherwise leave a live
	// "cli-device" credential in the org that no device will ever receive.
	if err := s.auth.Devices().Check(userCode); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	// Mint an API key for the org so the CLI can authenticate as an agent.
	gen, err := auth.GenerateAPIKey()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	key, err := s.store.CreateAPIKey(r.Context(), store.APIKey{
		OrgID: p.OrgID, Name: "cli-device", Prefix: gen.Prefix, Hash: gen.Hash,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := s.auth.Devices().Approve(userCode, p.OrgID, gen.Full); err != nil {
		// The flow ended between Check and Approve (it expired, or a concurrent
		// request approved it first). Nothing will deliver this key, so retire it.
		if rerr := s.store.RevokeAPIKey(r.Context(), key.ID, p.OrgID, time.Now()); rerr != nil {
			s.log.Error("device approve: could not revoke an undelivered key", "key", key.ID, "org", p.OrgID, "err", rerr)
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "approved"})
}

func (s *Server) handleDeviceToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DeviceCode string `json:"device_code"`
	}
	if !decode(w, r, &req) {
		return
	}
	key, err := s.auth.Devices().Poll(req.DeviceCode)
	if err != nil {
		// RFC 8628-style pending/expired errors use 400 with an error code.
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"api_key": key})
}

// --- helpers ---

// provisionUser is the dev-only password-less path: it returns the account for
// an email, creating it (and its personal org) when it does not exist yet.
func (s *Server) provisionUser(ctx context.Context, email, name, avatar, provider string) (store.User, store.Org, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	u, err := s.store.GetUserByEmail(ctx, email)
	if err == nil {
		org, err := s.firstOrg(ctx, u.ID)
		return u, org, err
	}
	if !errors.Is(err, store.ErrNotFound) {
		return store.User{}, store.Org{}, err
	}
	return s.createUserWithOrg(ctx, store.User{Email: email, Name: name, AvatarURL: avatar, OAuthProvider: provider})
}

// provisionOAuthUser resolves a verified provider profile to a TRQSH account.
//
// One verified email is one account: a provider account (provider + stable
// subject) is linked to the user that owns its verified email, so signing in with
// GitHub and with Google lands in the same account instead of two. The subject
// stays the identity once linked, so a later email change never loses the account.
// Providers only report verified addresses (see auth.OAuthProvider), which is what
// makes matching on email safe.
func (s *Server) provisionOAuthUser(ctx context.Context, profile auth.OAuthUser) (store.User, store.Org, error) {
	if profile.Subject == "" || profile.Email == "" || (profile.Provider != "github" && profile.Provider != "google") {
		return store.User{}, store.Org{}, auth.ErrUnverifiedEmail
	}
	u, err := s.store.GetUserByOAuth(ctx, profile.Provider, profile.Subject)
	if errors.Is(err, store.ErrNotFound) {
		u, err = s.userForVerifiedEmail(ctx, profile)
		if errors.Is(err, store.ErrNotFound) {
			created, org, cerr := s.createUserWithOrg(ctx, store.User{
				Email: profile.Email, Name: profile.Name, AvatarURL: profile.AvatarURL,
				OAuthProvider: profile.Provider, OAuthSubject: profile.Subject,
			})
			if !errors.Is(cerr, store.ErrConflict) {
				return created, org, cerr
			}
			// The other provider created this account a moment ago; join it.
			u, err = s.userForVerifiedEmail(ctx, profile)
		}
		if err == nil {
			err = s.store.LinkOAuthIdentity(ctx, u.ID, profile.Provider, profile.Subject)
		}
	}
	if err != nil {
		return store.User{}, store.Org{}, err
	}
	s.syncOAuthProfile(ctx, &u, profile)
	org, err := s.firstOrg(ctx, u.ID)
	return u, org, err
}

// userForVerifiedEmail finds the existing account for any of the profile's
// verified addresses, preferring the primary one.
func (s *Server) userForVerifiedEmail(ctx context.Context, profile auth.OAuthUser) (store.User, error) {
	for _, email := range append([]string{profile.Email}, profile.AlternateEmails...) {
		u, err := s.store.GetUserByEmail(ctx, email)
		if !errors.Is(err, store.ErrNotFound) {
			return u, err
		}
	}
	return store.User{}, store.ErrNotFound
}

// syncOAuthProfile refreshes the account's name and picture from the provider.
// GitHub is the canonical profile source: it is always applied, while Google's
// profile is only used until a GitHub account is linked. Signing in with Google
// therefore never replaces a GitHub picture.
func (s *Server) syncOAuthProfile(ctx context.Context, u *store.User, profile auth.OAuthUser) {
	if profile.Provider != "github" {
		linked, err := s.store.ListOAuthProviders(ctx, u.ID)
		if err != nil || slices.Contains(linked, "github") {
			return
		}
	}
	name, avatar := profile.Name, profile.AvatarURL
	if (name == "" || name == u.Name) && (avatar == "" || avatar == u.AvatarURL) {
		return
	}
	if err := s.store.UpdateUserProfile(ctx, u.ID, name, avatar); err != nil {
		return
	}
	if name != "" {
		u.Name = name
	}
	if avatar != "" {
		u.AvatarURL = avatar
	}
}

// createUserWithOrg inserts a user with its personal org and owner membership.
func (s *Server) createUserWithOrg(ctx context.Context, user store.User) (store.User, store.Org, error) {
	if user.Name == "" {
		user.Name = strings.Split(user.Email, "@")[0]
	}
	u, err := s.store.CreateUser(ctx, user)
	if err != nil {
		return store.User{}, store.Org{}, err
	}
	org, err := s.store.CreateOrg(ctx, store.Org{Name: u.Name + "'s org", Plan: PlanFree})
	if err != nil {
		return store.User{}, store.Org{}, err
	}
	if err := s.store.AddOrgMember(ctx, store.OrgMember{OrgID: org.ID, UserID: u.ID, Role: "owner"}); err != nil {
		return store.User{}, store.Org{}, err
	}
	return u, org, nil
}

func (s *Server) firstOrg(ctx context.Context, userID string) (store.Org, error) {
	orgs, err := s.store.OrgsForUser(ctx, userID)
	if err != nil {
		return store.Org{}, err
	}
	if len(orgs) == 0 {
		return store.Org{}, errors.New("user has no org")
	}
	return orgs[0], nil
}

func (s *Server) newState() string {
	return s.oauthState.New()
}

func (s *Server) checkState(state string) bool {
	return s.oauthState.Check(state)
}

// userCanSignIn reports whether the account still exists and is not suspended.
// A user that no longer exists (deleted by an admin) cannot refresh either.
func (s *Server) userCanSignIn(ctx context.Context, userID string) (bool, error) {
	u, err := s.store.GetUser(ctx, userID)
	if errors.Is(err, store.ErrNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return u.DisabledAt == nil, nil
}

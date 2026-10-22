package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/trqsh-uz/trqsh/internal/api"
	"github.com/trqsh-uz/trqsh/internal/api/store"
	"github.com/trqsh-uz/trqsh/internal/entitlerpc"
	"github.com/trqsh-uz/trqsh/pkg/authz"
)

// adminHarness is a signed-in admin session against an in-memory API.
type adminHarness struct {
	t      *testing.T
	ts     *httptest.Server
	srv    *api.Server
	client *http.Client
	csrf   string
}

const (
	harnessAdminUser = "root"
	harnessAdminPass = "harness-admin-pass"
)

func newAdminHarness(t *testing.T) *adminHarness {
	t.Helper()
	cfg := api.DefaultConfig()
	cfg.DevAuth = true
	cfg.AdminUser, cfg.AdminPassword = harnessAdminUser, harnessAdminPass
	srv, err := api.New(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatalf("api.New: %v", err)
	}
	ts := httptest.NewServer(srv.Router())
	t.Cleanup(ts.Close)
	jar, _ := cookiejar.New(nil)
	h := &adminHarness{t: t, ts: ts, srv: srv, client: &http.Client{Jar: jar}}
	var login struct {
		CSRF string `json:"csrf_token"`
	}
	if code := h.do("POST", "/admin/login", map[string]string{"username": harnessAdminUser, "password": harnessAdminPass}, &login); code != 200 {
		t.Fatalf("admin login = %d", code)
	}
	h.csrf = login.CSRF
	return h
}

// do sends an admin request and decodes a JSON response into out (if non-nil).
func (h *adminHarness) do(method, path string, body, out any) int {
	h.t.Helper()
	var rd io.Reader
	if body != nil {
		buf, _ := json.Marshal(body)
		rd = bytes.NewReader(buf)
	}
	req, _ := http.NewRequest(method, h.ts.URL+path, rd)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if h.csrf != "" {
		req.Header.Set("X-CSRF-Token", h.csrf)
	}
	resp, err := h.client.Do(req)
	if err != nil {
		h.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer func() { _ = resp.Body.Close() }()
	raw, _ := io.ReadAll(resp.Body)
	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			h.t.Fatalf("%s %s: decode: %v (%s)", method, path, err, raw)
		}
	}
	return resp.StatusCode
}

func (h *adminHarness) mustDo(method, path string, body, out any, want int) {
	h.t.Helper()
	if got := h.do(method, path, body, out); got != want {
		h.t.Fatalf("%s %s = %d, want %d", method, path, got, want)
	}
}

// account is a signed-up user with its first org and API key.
type account struct {
	ID, OrgID, Email, Access, Refresh, Key string
}

func (h *adminHarness) signup(email string) account {
	h.t.Helper()
	var su struct {
		User struct{ ID string } `json:"user"`
		Org  struct{ ID string } `json:"org"`
		Tok  struct {
			Access  string `json:"access_token"`
			Refresh string `json:"refresh_token"`
		} `json:"tokens"`
	}
	postJSON(h.t, h.ts.URL+"/v1/auth/signup", "", map[string]string{"email": email, "name": "T " + email}, &su)
	var key struct {
		APIKey string `json:"api_key"`
	}
	postJSON(h.t, h.ts.URL+"/v1/api-keys", su.Tok.Access, map[string]string{"name": "ci"}, &key)
	if su.User.ID == "" || key.APIKey == "" {
		h.t.Fatalf("signup %s incomplete: %+v", email, su)
	}
	return account{ID: su.User.ID, OrgID: su.Org.ID, Email: email, Access: su.Tok.Access, Refresh: su.Tok.Refresh, Key: key.APIKey}
}

func (h *adminHarness) bindAllowed(key, kind string) (bool, string) {
	rpc := entitlerpc.NewClient(h.ts.URL, api.DefaultConfig().InternalToken)
	dec, err := rpc.CheckBind(context.Background(), authz.BindRequest{APIKey: key, Type: kind})
	if err != nil {
		h.t.Fatalf("CheckBind: %v", err)
	}
	return dec.Allow, dec.ErrorMessage
}

func (h *adminHarness) refreshStatus(refresh string) int {
	h.t.Helper()
	resp := postJSON(h.t, h.ts.URL+"/v1/auth/refresh", "", map[string]string{"refresh_token": refresh}, nil)
	_ = resp.Body.Close()
	return resp.StatusCode
}

type auditList struct {
	Entries []struct {
		Action, TargetType, TargetID, Actor string
	} `json:"entries"`
	Total int `json:"total"`
}

func (h *adminHarness) auditActions(query string) []string {
	h.t.Helper()
	var l auditList
	h.mustDo("GET", "/v1/admin/audit?"+query, nil, &l, 200)
	out := make([]string, 0, len(l.Entries))
	for _, e := range l.Entries {
		out = append(out, e.Action)
	}
	return out
}

func TestAdminEndpointsRequireSession(t *testing.T) {
	ts := adminServer(t)
	for _, tc := range []struct{ method, path string }{
		{"GET", "/v1/admin/usage"}, {"GET", "/v1/admin/search?q=ab"}, {"GET", "/v1/admin/system"},
		{"GET", "/v1/admin/plans"}, {"GET", "/v1/admin/audit"},
		{"GET", "/v1/admin/users/x"}, {"PATCH", "/v1/admin/users/x"}, {"POST", "/v1/admin/users/x/disable"},
		{"POST", "/v1/admin/users/x/enable"}, {"DELETE", "/v1/admin/users/x"},
		{"GET", "/v1/admin/orgs/x"}, {"PATCH", "/v1/admin/orgs/x"}, {"POST", "/v1/admin/orgs/x/plan"},
		{"POST", "/v1/admin/orgs/x/suspend"}, {"POST", "/v1/admin/orgs/x/unsuspend"}, {"DELETE", "/v1/admin/orgs/x"},
		{"POST", "/v1/admin/orgs/x/members"}, {"PATCH", "/v1/admin/orgs/x/members/y"}, {"DELETE", "/v1/admin/orgs/x/members/y"},
		{"POST", "/v1/admin/orgs/x/subdomains"},
		{"GET", "/v1/admin/api-keys"}, {"DELETE", "/v1/admin/api-keys/x"},
		{"GET", "/v1/admin/subdomains"}, {"DELETE", "/v1/admin/subdomains/x"},
		{"GET", "/v1/admin/domains"}, {"POST", "/v1/admin/domains/x/verify"}, {"DELETE", "/v1/admin/domains/x"},
		{"GET", "/v1/admin/subscriptions"}, {"GET", "/v1/admin/billing/queue"},
	} {
		req, _ := http.NewRequest(tc.method, ts.URL+tc.path, nil)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("%s %s: %v", tc.method, tc.path, err)
		}
		_ = resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("%s %s without session = %d, want 401", tc.method, tc.path, resp.StatusCode)
		}
	}
}

func TestAdminMutationsNeedCSRFToken(t *testing.T) {
	h := newAdminHarness(t)
	a := h.signup("csrf@example.com")
	h.csrf = "" // session cookie only, no proof header
	if code := h.do("POST", "/v1/admin/users/"+a.ID+"/disable", map[string]string{"reason": "x"}, nil); code != http.StatusForbidden {
		t.Fatalf("disable without CSRF token = %d, want 403", code)
	}
	if u, _ := h.srv.Store().GetUser(context.Background(), a.ID); u.DisabledAt != nil {
		t.Fatal("user was disabled without a CSRF token")
	}
}

func TestAdminUserLifecycle(t *testing.T) {
	h := newAdminHarness(t)
	a := h.signup("life@example.com")
	other := h.signup("bystander@example.com")

	var detail struct {
		User struct {
			Email string `json:"email"`
		} `json:"user"`
		Orgs []map[string]any `json:"orgs"`
	}
	h.mustDo("GET", "/v1/admin/users/"+a.ID, nil, &detail, 200)
	if detail.User.Email != a.Email || len(detail.Orgs) != 1 || detail.Orgs[0]["role"] != "owner" {
		t.Fatalf("user detail = %+v", detail)
	}
	h.mustDo("GET", "/v1/admin/users/nope", nil, nil, 404)

	h.mustDo("PATCH", "/v1/admin/users/"+a.ID, map[string]string{"name": "   "}, nil, 400)
	h.mustDo("PATCH", "/v1/admin/users/"+a.ID, map[string]string{"name": "Renamed"}, nil, 200)

	// A live session can refresh until the account is suspended.
	if got := h.refreshStatus(a.Refresh); got != 200 {
		t.Fatalf("refresh before suspend = %d", got)
	}
	h.mustDo("POST", "/v1/admin/users/"+a.ID+"/disable", map[string]string{"reason": "abuse"}, nil, 200)
	if got := h.refreshStatus(a.Refresh); got != 401 {
		t.Fatalf("refresh while suspended = %d, want 401", got)
	}
	if resp := postJSON(t, h.ts.URL+"/v1/auth/login", "", map[string]string{"email": a.Email}, nil); resp.StatusCode != http.StatusForbidden {
		t.Fatalf("login while suspended = %d, want 403", resp.StatusCode)
	}
	if got := h.refreshStatus(other.Refresh); got != 200 {
		t.Fatalf("suspending one user affected another: refresh = %d", got)
	}

	h.mustDo("POST", "/v1/admin/users/"+a.ID+"/enable", nil, nil, 200)
	if got := h.refreshStatus(a.Refresh); got != 200 {
		t.Fatalf("refresh after enable = %d", got)
	}

	// Deleting needs the email typed back, and removes the account for good.
	h.mustDo("DELETE", "/v1/admin/users/"+a.ID, nil, nil, 400)
	h.mustDo("DELETE", "/v1/admin/users/"+a.ID+"?confirm=wrong@example.com", nil, nil, 400)
	h.mustDo("DELETE", "/v1/admin/users/"+a.ID+"?confirm="+url.QueryEscape(a.Email), nil, nil, 204)
	h.mustDo("GET", "/v1/admin/users/"+a.ID, nil, nil, 404)
	if got := h.refreshStatus(a.Refresh); got != 401 {
		t.Fatalf("refresh for a deleted user = %d, want 401", got)
	}
	if _, err := h.srv.Store().GetOrg(context.Background(), a.OrgID); err == nil {
		t.Fatal("deleting the only member should delete their personal org")
	}
	if allowed, _ := h.bindAllowed(a.Key, "http"); allowed {
		t.Fatal("a deleted user's API key still authenticates")
	}

	want := []string{"user.delete", "user.enable", "user.disable", "user.rename"}
	got := h.auditActions("q=" + a.ID)
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("audit actions = %v, want %v (newest first)", got, want)
	}
}

func TestAdminOrgSuspensionBlocksKeys(t *testing.T) {
	h := newAdminHarness(t)
	a := h.signup("susp@example.com")

	if ok, msg := h.bindAllowed(a.Key, "http"); !ok {
		t.Fatalf("bind before suspend denied: %s", msg)
	}
	h.mustDo("POST", "/v1/admin/orgs/"+a.OrgID+"/suspend", map[string]string{"reason": "chargeback"}, nil, 200)

	ok, msg := h.bindAllowed(a.Key, "http")
	if ok || !strings.Contains(msg, "suspended") {
		t.Fatalf("bind while suspended: allowed=%v msg=%q", ok, msg)
	}
	// The REST API refuses the same key.
	req, _ := http.NewRequest("GET", h.ts.URL+"/v1/me", nil)
	req.Header.Set("Authorization", "Bearer "+a.Key)
	resp, _ := http.DefaultClient.Do(req)
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("/v1/me with suspended org key = %d, want 401", resp.StatusCode)
	}

	var detail struct {
		Org map[string]any `json:"org"`
	}
	h.mustDo("GET", "/v1/admin/orgs/"+a.OrgID, nil, &detail, 200)
	if detail.Org["suspended_reason"] != "chargeback" || detail.Org["suspended_at"] == nil {
		t.Fatalf("org detail does not show the suspension: %+v", detail.Org)
	}

	h.mustDo("POST", "/v1/admin/orgs/"+a.OrgID+"/unsuspend", nil, nil, 200)
	if ok, msg := h.bindAllowed(a.Key, "http"); !ok {
		t.Fatalf("bind after unsuspend denied: %s", msg)
	}
}

func TestAdminOrgPlanAndRename(t *testing.T) {
	h := newAdminHarness(t)
	a := h.signup("plan@example.com")

	if ok, _ := h.bindAllowed(a.Key, "udp"); ok {
		t.Fatal("free plan should deny UDP")
	}
	h.mustDo("POST", "/v1/admin/orgs/"+a.OrgID+"/plan", map[string]any{"plan": "enterprise", "months": 1}, nil, 400)
	h.mustDo("POST", "/v1/admin/orgs/"+a.OrgID+"/plan", map[string]any{"plan": "pro", "months": 500}, nil, 400)

	var row struct {
		Plan string  `json:"plan"`
		Exp  *string `json:"plan_expires_at"`
	}
	h.mustDo("POST", "/v1/admin/orgs/"+a.OrgID+"/plan", map[string]any{"plan": "pro", "months": 2}, &row, 200)
	if row.Plan != "pro" || row.Exp == nil {
		t.Fatalf("plan with expiry = %+v", row)
	}
	if ok, msg := h.bindAllowed(a.Key, "udp"); !ok {
		t.Fatalf("pro should allow UDP: %s", msg)
	}
	// The audit row records the plan that was replaced, not the new one.
	var logged struct {
		Entries []struct {
			Detail map[string]any `json:"detail"`
		} `json:"entries"`
	}
	h.mustDo("GET", "/v1/admin/audit?action=org.plan&target_id="+a.OrgID, nil, &logged, 200)
	if len(logged.Entries) != 1 || logged.Entries[0].Detail["from"] != "free" || logged.Entries[0].Detail["to"] != "pro" {
		t.Fatalf("plan audit detail = %+v", logged.Entries)
	}

	// months=0 never expires; free always clears the expiry.
	h.mustDo("POST", "/v1/admin/orgs/"+a.OrgID+"/plan", map[string]any{"plan": "team", "months": 0}, &row, 200)
	if row.Plan != "team" || row.Exp != nil {
		t.Fatalf("plan without expiry = %+v", row)
	}
	h.mustDo("POST", "/v1/admin/orgs/"+a.OrgID+"/plan", map[string]any{"plan": "free", "months": 6}, &row, 200)
	if row.Plan != "free" || row.Exp != nil {
		t.Fatalf("free should not carry an expiry: %+v", row)
	}

	h.mustDo("PATCH", "/v1/admin/orgs/"+a.OrgID, map[string]string{"name": ""}, nil, 400)
	h.mustDo("PATCH", "/v1/admin/orgs/"+a.OrgID, map[string]string{"name": "Acme Inc"}, nil, 200)
	if o, _ := h.srv.Store().GetOrg(context.Background(), a.OrgID); o.Name != "Acme Inc" {
		t.Fatalf("org name = %q", o.Name)
	}
}

func TestAdminOrgMembersGuards(t *testing.T) {
	h := newAdminHarness(t)
	owner := h.signup("owner@example.com")
	mate := h.signup("mate@example.com")
	base := "/v1/admin/orgs/" + owner.OrgID + "/members"

	h.mustDo("POST", base, map[string]string{"email": mate.Email, "role": "superuser"}, nil, 400)
	h.mustDo("POST", base, map[string]string{"email": "ghost@example.com", "role": "member"}, nil, 404)
	h.mustDo("POST", base, map[string]string{"email": mate.Email, "role": "member"}, nil, 201)
	h.mustDo("POST", base, map[string]string{"email": mate.Email, "role": "member"}, nil, 409)

	// The only owner can be neither demoted nor removed.
	h.mustDo("PATCH", base+"/"+owner.ID, map[string]string{"role": "member"}, nil, 409)
	h.mustDo("DELETE", base+"/"+owner.ID, nil, nil, 409)

	h.mustDo("PATCH", base+"/"+mate.ID, map[string]string{"role": "owner"}, nil, 200)
	h.mustDo("PATCH", base+"/"+owner.ID, map[string]string{"role": "member"}, nil, 200)
	h.mustDo("DELETE", base+"/"+owner.ID, nil, nil, 204)
	// Only one member is left; removing them would orphan the org.
	h.mustDo("DELETE", base+"/"+mate.ID, nil, nil, 409)
}

func TestAdminOrgDeleteGuards(t *testing.T) {
	h := newAdminHarness(t)
	a := h.signup("delorg@example.com")
	b := h.signup("paying@example.com")

	// A live Stripe subscription blocks deletion (the org and its owner's account).
	if _, err := h.srv.Store().UpsertSubscription(context.Background(), store.Subscription{
		OrgID: b.OrgID, StripeSubID: "sub_live", StripeCustomerID: "cus_1", Plan: "pro", Status: "active",
		CurrentPeriodEnd: time.Now().Add(24 * time.Hour),
	}); err != nil {
		t.Fatal(err)
	}
	var detail struct {
		Org map[string]any `json:"org"`
	}
	h.mustDo("GET", "/v1/admin/orgs/"+b.OrgID, nil, &detail, 200)
	if detail.Org["live_subscription"] != true {
		t.Fatalf("org detail should flag the live subscription: %+v", detail.Org)
	}
	h.mustDo("DELETE", "/v1/admin/orgs/"+b.OrgID+"?confirm=T+paying", nil, nil, 400)
	var orgRow struct {
		Org struct{ Name string } `json:"org"`
	}
	h.mustDo("GET", "/v1/admin/orgs/"+b.OrgID, nil, &orgRow, 200)
	h.mustDo("DELETE", "/v1/admin/orgs/"+b.OrgID+"?confirm="+url.QueryEscape(orgRow.Org.Name), nil, nil, 409)
	h.mustDo("DELETE", "/v1/admin/users/"+b.ID+"?confirm="+url.QueryEscape(b.Email), nil, nil, 409)

	var subs struct {
		Subscriptions []map[string]any `json:"subscriptions"`
		Total         int              `json:"total"`
	}
	h.mustDo("GET", "/v1/admin/subscriptions?status=active", nil, &subs, 200)
	if subs.Total != 1 || subs.Subscriptions[0]["org_name"] != orgRow.Org.Name {
		t.Fatalf("subscriptions = %+v", subs)
	}

	// An org without one is removed after the name is typed back.
	var an struct {
		Org struct{ Name string } `json:"org"`
	}
	h.mustDo("GET", "/v1/admin/orgs/"+a.OrgID, nil, &an, 200)
	h.mustDo("DELETE", "/v1/admin/orgs/"+a.OrgID+"?confirm=nope", nil, nil, 400)
	h.mustDo("DELETE", "/v1/admin/orgs/"+a.OrgID+"?confirm="+url.QueryEscape(an.Org.Name), nil, nil, 204)
	h.mustDo("GET", "/v1/admin/orgs/"+a.OrgID, nil, nil, 404)
	if ok, _ := h.bindAllowed(a.Key, "http"); ok {
		t.Fatal("an API key of a deleted org still authenticates")
	}
}

func TestAdminResourceDirectories(t *testing.T) {
	h := newAdminHarness(t)
	a := h.signup("res@example.com")
	b := h.signup("res2@example.com")
	h.mustDo("POST", "/v1/admin/orgs/"+a.OrgID+"/plan", map[string]any{"plan": "pro", "months": 1}, nil, 200)

	// Subdomains: reserved by the admin, bypassing the free cap; platform names refused.
	sub := "/v1/admin/orgs/" + a.OrgID + "/subdomains"
	h.mustDo("POST", sub, map[string]string{"subdomain": "api"}, nil, 403)
	h.mustDo("POST", sub, map[string]string{"subdomain": "Bad_Name"}, nil, 400)
	h.mustDo("POST", "/v1/admin/orgs/"+b.OrgID+"/subdomains", map[string]string{"subdomain": "taken-one"}, nil, 201)
	h.mustDo("POST", sub, map[string]string{"subdomain": "taken-one"}, nil, 409)
	var subs struct {
		Subdomains []struct {
			ID, Subdomain string
			OrgName       string `json:"org_name"`
		} `json:"subdomains"`
		Total int `json:"total"`
	}
	h.mustDo("GET", "/v1/admin/subdomains?q=taken", nil, &subs, 200)
	if subs.Total != 1 || subs.Subdomains[0].OrgName == "" {
		t.Fatalf("subdomains = %+v", subs)
	}
	h.mustDo("DELETE", "/v1/admin/subdomains/"+subs.Subdomains[0].ID, nil, nil, 204)
	h.mustDo("DELETE", "/v1/admin/subdomains/"+subs.Subdomains[0].ID, nil, nil, 404)

	// Domains: a user adds one (Pro), the admin force-verifies it, then removes it.
	var added struct {
		Domain struct{ ID string } `json:"domain"`
	}
	postJSON(t, h.ts.URL+"/v1/domains", a.Access, map[string]string{"domain": "demo.example.org"}, &added)
	if added.Domain.ID == "" {
		t.Fatal("user could not add a domain on a granted Pro plan")
	}
	var doms struct {
		Domains []struct {
			ID, Domain, CertStatus string
			VerifiedAt             *string `json:"verified_at"`
		} `json:"domains"`
	}
	h.mustDo("GET", "/v1/admin/domains?status=pending", nil, &doms, 200)
	if len(doms.Domains) != 1 || doms.Domains[0].VerifiedAt != nil {
		t.Fatalf("pending domains = %+v", doms)
	}
	h.mustDo("POST", "/v1/admin/domains/"+added.Domain.ID+"/verify", nil, nil, 200)
	h.mustDo("GET", "/v1/admin/domains?status=verified", nil, &doms, 200)
	if len(doms.Domains) != 1 || doms.Domains[0].VerifiedAt == nil {
		t.Fatalf("verified domains = %+v", doms)
	}
	h.mustDo("DELETE", "/v1/admin/domains/"+added.Domain.ID, nil, nil, 204)
	h.mustDo("POST", "/v1/admin/domains/"+added.Domain.ID+"/verify", nil, nil, 404)

	// API keys: listed across orgs without ever exposing the hash, then revoked.
	var keys struct {
		Keys  []map[string]any `json:"keys"`
		Total int              `json:"total"`
	}
	h.mustDo("GET", "/v1/admin/api-keys?state=active", nil, &keys, 200)
	if keys.Total < 2 {
		t.Fatalf("api keys total = %d, want >= 2", keys.Total)
	}
	for _, k := range keys.Keys {
		if _, leaked := k["hash"]; leaked {
			t.Fatalf("admin key list exposes the key hash: %+v", k)
		}
	}
	h.mustDo("GET", "/v1/admin/api-keys?q="+a.OrgID, nil, &keys, 200)
	if keys.Total != 1 {
		t.Fatalf("filtering keys by org id = %d, want 1", keys.Total)
	}
	keyID := keys.Keys[0]["id"].(string)
	if ok, _ := h.bindAllowed(a.Key, "http"); !ok {
		t.Fatal("key should work before revoke")
	}
	h.mustDo("DELETE", "/v1/admin/api-keys/"+keyID, nil, nil, 204)
	if ok, _ := h.bindAllowed(a.Key, "http"); ok {
		t.Fatal("revoked key still authenticates")
	}
	h.mustDo("DELETE", "/v1/admin/api-keys/missing", nil, nil, 404)
	h.mustDo("GET", "/v1/admin/api-keys?state=revoked", nil, &keys, 200)
	if keys.Total != 1 {
		t.Fatalf("revoked keys = %d, want 1", keys.Total)
	}
}

func TestAdminReadViews(t *testing.T) {
	h := newAdminHarness(t)
	a := h.signup("views@example.com")
	now := time.Now()
	if err := h.srv.Store().UpsertUsage(context.Background(), store.UsageRecord{
		OrgID: a.OrgID, BytesIn: 1000, BytesOut: 3000, Requests: 7, WindowStart: now.Add(-time.Minute), WindowEnd: now,
	}); err != nil {
		t.Fatal(err)
	}
	reportTunnel(t, h.ts.URL, entitlerpc.TunnelReport{
		Action: "open", EdgeID: "e", SessionID: "s", TunnelID: "t", AccountID: a.OrgID,
		Type: "http", PublicURL: "https://views-demo.trqsh.uz", Region: "eu", ClientIP: "8.8.8.8", At: now,
	})

	var usage struct {
		Series []map[string]any `json:"series"`
		Top    []struct {
			OrgID string `json:"org_id"`
		} `json:"top_orgs"`
	}
	h.mustDo("GET", "/v1/admin/usage?days=7", nil, &usage, 200)
	if len(usage.Series) != 1 || len(usage.Top) != 1 || usage.Top[0].OrgID != a.OrgID {
		t.Fatalf("usage = %+v", usage)
	}

	var search struct {
		Users []map[string]any `json:"users"`
		Orgs  []map[string]any `json:"orgs"`
	}
	h.mustDo("GET", "/v1/admin/search?q=views", nil, &search, 200)
	if len(search.Users) != 1 || len(search.Orgs) != 1 {
		t.Fatalf("search = %+v", search)
	}
	h.mustDo("GET", "/v1/admin/search?q=v", nil, &search, 200)
	if len(search.Users) != 0 {
		t.Fatalf("a one-character query should not search: %+v", search)
	}

	var tun struct {
		Sessions []map[string]any `json:"sessions"`
		Total    int              `json:"total"`
	}
	h.mustDo("GET", "/v1/admin/tunnels?active=true&type=http&q=views-demo", nil, &tun, 200)
	if tun.Total != 1 || len(tun.Sessions) != 1 {
		t.Fatalf("filtered tunnels = %+v", tun)
	}
	h.mustDo("GET", "/v1/admin/tunnels?type=udp", nil, &tun, 200)
	if tun.Total != 0 {
		t.Fatalf("type filter ignored: %+v", tun)
	}
	h.mustDo("GET", "/v1/admin/tunnels?org="+a.OrgID+"&q=zzz", nil, &tun, 200)
	if tun.Total != 0 {
		t.Fatalf("search filter ignored: %+v", tun)
	}

	var detail struct {
		Tunnels struct {
			Active int `json:"active"`
		} `json:"tunnels"`
		Usage   map[string]any   `json:"usage"`
		Members []map[string]any `json:"members"`
		Limits  map[string]any   `json:"limits"`
	}
	h.mustDo("GET", "/v1/admin/orgs/"+a.OrgID, nil, &detail, 200)
	if detail.Tunnels.Active != 1 || len(detail.Members) != 1 || detail.Usage["bytes_out"] != float64(3000) || detail.Limits["code"] != "free" {
		t.Fatalf("org detail = %+v", detail)
	}

	var plans struct {
		Plans []map[string]any `json:"plans"`
	}
	h.mustDo("GET", "/v1/admin/plans", nil, &plans, 200)
	if len(plans.Plans) < 3 {
		t.Fatalf("plans = %d", len(plans.Plans))
	}
	h.mustDo("GET", "/v1/admin/billing/queue", nil, nil, 200)
	h.mustDo("GET", "/v1/admin/audit?limit=5", nil, nil, 200)
}

func TestAdminSystemSnapshotHidesSecrets(t *testing.T) {
	h := newAdminHarness(t)
	req, _ := http.NewRequest("GET", h.ts.URL+"/v1/admin/system", nil)
	resp, err := h.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		t.Fatalf("system = %d", resp.StatusCode)
	}
	cfg := api.DefaultConfig()
	for _, secret := range []string{harnessAdminPass, cfg.JWTSecret, cfg.InternalToken} {
		if strings.Contains(string(raw), secret) {
			t.Fatalf("system snapshot leaks a secret: %q", secret)
		}
	}
	var sys struct {
		Service string         `json:"service"`
		Config  map[string]any `json:"config"`
	}
	if err := json.Unmarshal(raw, &sys); err != nil || sys.Service != "trqsh-control-api" || sys.Config["store"] != "memory" {
		t.Fatalf("system snapshot = %s", raw)
	}
}

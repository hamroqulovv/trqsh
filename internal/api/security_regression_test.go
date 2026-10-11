package api

import (
	"context"
	"fmt"
	"github.com/trqsh-uz/trqsh/internal/api/auth"
	"github.com/trqsh-uz/trqsh/internal/api/store"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestAuditSessionCookieIsolation(t *testing.T) {
	s := &Server{cfg: Config{BaseDomain: "example.test", Env: "production"}}
	w := httptest.NewRecorder()
	s.setSessionCookies(w, auth.Tokens{Access: "audit-access", Refresh: "audit-refresh", ExpiresIn: 3600})
	jar, _ := cookiejar.New(nil)
	origin, _ := url.Parse("https://api.example.test")
	tenant, _ := url.Parse("https://tenant.example.test")
	jar.SetCookies(origin, w.Result().Cookies())
	if got := jar.Cookies(tenant); len(got) != 0 {
		t.Errorf("session cookies sent to tenant host: %v", got)
	}
}

func TestOAuthAndLegacyCookieSecurityByEnvironment(t *testing.T) {
	for _, env := range []string{"production", "development"} {
		t.Run(env, func(t *testing.T) {
			s := &Server{cfg: Config{BaseDomain: "example.test", Env: env}}
			for _, age := range []int{600, -1} {
				w := httptest.NewRecorder()
				s.setDashboardStateCookie(w, "state", age)
				s.clearLegacySessionCookies(w)
				cookies := w.Result().Cookies()
				if len(cookies) != 3 {
					t.Fatalf("got %d cookies, want 3", len(cookies))
				}
				for _, cookie := range cookies {
					if cookie.Secure != (env == "production") || !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode {
						t.Errorf("unsafe cookie attributes: %+v", cookie)
					}
				}
			}
		})
	}
}

func TestAuditReservedPlatformSubdomain(t *testing.T) {
	cfg := DefaultConfig()
	s, err := New(cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	org, _ := s.store.CreateOrg(context.Background(), store.Org{Name: "audit", Plan: PlanFree})
	r := httptest.NewRequest("POST", "/v1/subdomains", strings.NewReader(`{"subdomain":"api"}`))
	r = r.WithContext(auth.WithPrincipal(r.Context(), auth.Principal{OrgID: org.ID}))
	w := httptest.NewRecorder()
	s.handleReserveSubdomain(w, r)
	if w.Code == http.StatusCreated {
		t.Errorf("platform subdomain api reserved by free org: status=%d", w.Code)
	}
}
func TestAuditAdminSameSiteCSRF(t *testing.T) {
	cfg := DefaultConfig()
	cfg.BaseDomain = "example.test"
	cfg.Env = "production"
	cfg.AdminUser = "audit"
	cfg.AdminPassword = "audit-only"
	s, err := New(cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	_, org, err := s.provisionUser(context.Background(), "audit@example.test", "audit", "", "email")
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest("POST", "https://approve.example.test/v1/admin/grant", strings.NewReader(`{"email":"audit@example.test","plan":"team","months":12}`))
	r.Header.Set("Content-Type", "text/plain")
	r.Header.Set("Origin", "https://tenant.example.test")
	r.Header.Set("Sec-Fetch-Site", "same-site")
	r.AddCookie(&http.Cookie{Name: adminCookie, Value: s.signAdmin(time.Now().Add(time.Hour))})
	w := httptest.NewRecorder()
	s.Router().ServeHTTP(w, r)
	updated, _ := s.store.GetOrg(context.Background(), org.ID)
	if w.Code == 200 && updated.Plan == PlanTeam {
		t.Errorf("same-site cross-origin text/plain request granted team plan without CSRF proof")
	}
}
func TestAuditUsageRPCDatabaseFailure(t *testing.T) {
	cfg := DefaultConfig()
	s, err := New(cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	s.ent.store = auditUsageStore{s.store}
	r := httptest.NewRequest("POST", "/internal/entitlements/report-usage", strings.NewReader(`{"account_id":"audit-org","bytes_in":100}`))
	w := httptest.NewRecorder()
	s.rpcReportUsage(w, r)
	if w.Code == 200 {
		t.Error("usage RPC acknowledges success despite database write failure")
	}
}

type auditUsageStore struct{ store.Store }

func (auditUsageStore) UpsertUsage(context.Context, store.UsageRecord) error {
	return fmt.Errorf("database offline")
}

func TestAdminProductionMutationGuards(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Env, cfg.BaseDomain = "production", "example.test"
	cfg.AdminUser, cfg.AdminPassword = "admin", "test-only"
	s, err := New(cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	value := s.signAdmin(time.Now().Add(time.Hour))
	for _, tc := range []struct {
		name, host, origin, media, csrf string
		status                          int
	}{
		{"allowed", "approve.example.test", "https://approve.example.test", "application/json", s.adminCSRF(value), 204},
		{"missing-proof", "approve.example.test", "https://approve.example.test", "application/json", "", 403},
		{"sibling-origin", "approve.example.test", "https://tenant.example.test", "application/json", s.adminCSRF(value), 403},
		{"no-origin", "approve.example.test", "", "application/json", s.adminCSRF(value), 403},
		{"plain-text", "approve.example.test", "https://approve.example.test", "text/plain", s.adminCSRF(value), 415},
		{"forged-host-header", "tenant.example.test", "https://approve.example.test", "application/json", s.adminCSRF(value), 403},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", "https://"+tc.host+"/v1/admin/grant", strings.NewReader(`{}`))
			r.AddCookie(&http.Cookie{Name: adminCookie, Value: value})
			r.Header.Set("Origin", tc.origin)
			r.Header.Set("Content-Type", tc.media)
			r.Header.Set("X-CSRF-Token", tc.csrf)
			r.Header.Set("X-Forwarded-Host", "approve.example.test")
			w := httptest.NewRecorder()
			s.requireAdmin(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) })).ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("status %d, want %d: %s", w.Code, tc.status, w.Body.String())
			}
		})
	}
}

func TestSafeOAuthDestination(t *testing.T) {
	for _, destination := range []string{"//attacker.test", "/\\attacker.test", "/\t/attacker.test", "/\r\n/attacker.test", "https://attacker.test", "/path\\suffix"} {
		if got := safeNextPath(destination); got != "" {
			t.Fatalf("unsafe path accepted: %q", got)
		}
	}
	for _, destination := range []string{"/", "/device?code=ABCD", "/settings?next=%2Ffoo"} {
		if got := safeNextPath(destination); got != destination {
			t.Fatalf("safe path changed: %q", got)
		}
	}
}

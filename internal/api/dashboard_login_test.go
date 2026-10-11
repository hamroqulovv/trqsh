package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/trqsh-uz/trqsh/internal/api/auth"
)

func TestDashboardLoginCodes(t *testing.T) {
	mr, rdb := newTestRedis(t)
	for _, backend := range []string{"memory", "redis"} {
		t.Run(backend, func(t *testing.T) {
			first, second := newDashboardLoginStore(nil), (*dashboardLoginStore)(nil)
			if backend == "redis" {
				first = newDashboardLoginStore(rdb)
				second = newDashboardLoginStore(rdb)
			} else {
				second = first
			}
			ctx := context.Background()
			entry := dashboardLogin{State: "browser", Next: "/device?code=123", Tokens: auth.Tokens{Access: "access", Refresh: "refresh"}}
			code, err := first.issue(ctx, entry)
			if err != nil {
				t.Fatal(err)
			}
			var accepted atomic.Int32
			var wg sync.WaitGroup
			for range 10 {
				wg.Add(1)
				go func() {
					defer wg.Done()
					if _, err := second.take(ctx, code, "browser"); err == nil {
						accepted.Add(1)
					}
				}()
			}
			wg.Wait()
			if accepted.Load() != 1 {
				t.Fatalf("code accepted %d times", accepted.Load())
			}
			code, _ = first.issue(ctx, entry)
			if _, err := second.take(ctx, code, "another-browser"); err == nil {
				t.Fatal("code accepted without browser binding")
			}
			code, _ = first.issue(ctx, entry)
			if backend == "memory" {
				first.entries[code] = dashboardLogin{State: "browser", Expires: time.Now().Add(-time.Second)}
			} else {
				mr.FastForward(dashboardLoginTTL + time.Second)
			}
			if _, err := second.take(ctx, code, "browser"); err == nil {
				t.Fatal("expired code accepted")
			}
		})
	}
}

func TestOAuthDashboardExchangeFlow(t *testing.T) {
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/token" {
			_, _ = w.Write([]byte(`{"access_token":"provider-token"}`))
			return
		}
		_, _ = w.Write([]byte(`{"email":"login@example.test","name":"Login","email_verified":true}`))
	}))
	defer provider.Close()
	cfg := DefaultConfig()
	cfg.AppURL = "https://app.example.test"
	cfg.BaseDomain = "example.test"
	s, err := New(cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	s.providers["google"] = auth.OAuthProvider{Name: "google", ClientID: "test", ClientSecret: "test", AuthURL: provider.URL, TokenURL: provider.URL + "/token", UserURL: provider.URL + "/user"}
	router := s.Router()
	bootstrap := httptest.NewRecorder()
	router.ServeHTTP(bootstrap, httptest.NewRequest("GET", "https://api.example.test/v1/auth/oauth/google?next=%2Fdevice", nil))
	if !strings.HasPrefix(bootstrap.Header().Get("Location"), cfg.AppURL+"/login/oauth/google") {
		t.Fatal("OAuth did not bootstrap on dashboard")
	}
	state := strings.Repeat("a", 64)
	start := httptest.NewRecorder()
	router.ServeHTTP(start, httptest.NewRequest("GET", "https://api.example.test/v1/auth/oauth/google?dashboard_state="+state+"&next=%2Fdevice", nil))
	authorization, _ := url.Parse(start.Header().Get("Location"))
	callback := httptest.NewRequest("GET", "https://api.example.test/v1/auth/oauth/google/callback?code=provider-code&state="+authorization.Query().Get("state"), nil)
	for _, cookie := range start.Result().Cookies() {
		callback.AddCookie(cookie)
	}
	finish := httptest.NewRecorder()
	router.ServeHTTP(finish, callback)
	dest, err := url.Parse(finish.Header().Get("Location"))
	if err != nil || dest.Host != "app.example.test" || dest.Path != "/login/callback" {
		t.Fatalf("callback: %d %s", finish.Code, finish.Body)
	}
	if dest.Query().Get("access_token") != "" || dest.Query().Get("refresh_token") != "" {
		t.Fatal("tokens in redirect")
	}
	body := `{"code":"` + dest.Query().Get("code") + `","state":"` + state + `"}`
	exchange := httptest.NewRecorder()
	router.ServeHTTP(exchange, httptest.NewRequest("POST", "/v1/auth/dashboard/exchange", strings.NewReader(body)))
	var login dashboardLogin
	if err := json.Unmarshal(exchange.Body.Bytes(), &login); err != nil || exchange.Code != 200 || login.Next != "/device" || login.Tokens.Access == "" {
		t.Fatalf("exchange: %d %s", exchange.Code, exchange.Body)
	}
	if _, err := s.auth.ParseToken(login.Tokens.Access); err != nil {
		t.Fatal(err)
	}
	replay := httptest.NewRecorder()
	router.ServeHTTP(replay, httptest.NewRequest("POST", "/v1/auth/dashboard/exchange", strings.NewReader(body)))
	if replay.Code != http.StatusUnauthorized {
		t.Fatalf("code replay status: %d", replay.Code)
	}
}

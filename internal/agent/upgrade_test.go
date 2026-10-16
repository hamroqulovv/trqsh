package agent

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestDeviceLoginUsesMigratedHostedEndpoint(t *testing.T) {
	t.Setenv("TRQSH_CONFIG", filepath.Join(t.TempDir(), "trqsh.yml"))
	t.Setenv("TRQSH_API_URL", "")
	cfg := DefaultConfig()
	cfg.APIBase = "https://api.trqsh.uz"
	cfg.Server = "trqsh.uz:4443"
	if err := cfg.Save(DefaultConfigPath()); err != nil {
		t.Fatal(err)
	}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/auth/device/code" {
			t.Errorf("unexpected login request: %s %s", r.Method, r.URL.Path)
		}
		apiWriteJSON(w, http.StatusOK, map[string]string{"device_code": "test-device-code"})
	}))
	defer upstream.Close()
	previous := DefaultAPIBase
	DefaultAPIBase = upstream.URL
	t.Cleanup(func() { DefaultAPIBase = previous })
	core := New(cfg, nil)
	defer func() { _ = core.Shutdown(context.Background()) }()
	api := NewLocalAPI(core)
	w := httptest.NewRecorder()
	api.Handler().ServeHTTP(w, httptest.NewRequest(http.MethodPost, "http://127.0.0.1/login/oauth/start", nil))
	if w.Code != http.StatusOK || w.Body.String() != "{\"device_code\":\"test-device-code\"}\n" {
		t.Fatalf("login: HTTP %d %s", w.Code, w.Body.String())
	}
}

func TestDaemonVersionMetadataRequiresAuthentication(t *testing.T) {
	t.Setenv("TRQSH_CONFIG", filepath.Join(t.TempDir(), "trqsh.yml"))
	core := New(DefaultConfig(), nil)
	defer func() { _ = core.Shutdown(context.Background()) }()
	api := NewLocalAPI(core).SetToken("test-token").OnShutdown(func() {})
	handler := api.secure(api.Handler())
	request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1/session", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, request)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated session: %d", w.Code)
	}
	request.Header.Set("Authorization", "Bearer test-token")
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, request)
	var info sessionInfo
	if err := json.Unmarshal(w.Body.Bytes(), &info); err != nil {
		t.Fatal(err)
	}
	if w.Code != http.StatusOK || info.Version != Version || !info.Managed {
		t.Fatalf("missing daemon metadata: %+v", info)
	}
}

package api

import (
	"strings"
	"testing"
)

func TestProductionRequiresConfiguredOAuthAndSecureOrigins(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Env, cfg.BaseDomain = "production", "trqsh.uz"
	cfg.PublicURL, cfg.AppURL = "https://api.trqsh.uz", "https://app.trqsh.uz"
	cfg.JWTSecret, cfg.InternalToken = strings.Repeat("a", 64), strings.Repeat("b", 64)
	cfg.DatabaseURL = "postgres://local-test-only"
	if err := cfg.validate(); err == nil {
		t.Fatal("production accepted no OAuth provider")
	}
	cfg.GitHubClientID, cfg.GitHubClientSecret = "test-id", "test-secret"
	if err := cfg.validate(); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"http://app.trqsh.uz", "https://", "https://user:password@app.trqsh.uz", "https://app.trqsh.uz/login", "https://app.trqsh.uz?next=evil", "https://*.trqsh.uz"} {
		copy := cfg
		copy.AppURL = bad
		if err := copy.validate(); err == nil {
			t.Errorf("unsafe origin accepted: %s", bad)
		}
	}
	cfg.GoogleClientID = "partial-id"
	if err := cfg.validate(); err == nil {
		t.Fatal("partial Google credentials accepted")
	}
	cfg.Env = "prodution"
	if err := cfg.validate(); err == nil {
		t.Fatal("misspelled environment bypassed production validation")
	}
}

package agent

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultConfig(t *testing.T) {
	c := DefaultConfig()
	if c.Server == "" || c.Inspector.Addr == "" || c.ControlAddr == "" {
		t.Fatalf("defaults incomplete: %+v", c)
	}
	if !c.Inspector.Enabled {
		t.Error("inspector should default enabled")
	}
}

func TestLoadFileOverridesDefaults(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "trqsh.yml")
	yaml := "version: 1\nserver: edge.example:4443\nregion: eu\ntransport: tcp\n" +
		"tunnels:\n  web:\n    proto: http\n    addr: localhost:3000\n    subdomain: myapp\n"
	if err := writeFile(t, path, yaml); err != nil {
		t.Fatal(err)
	}
	c, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if c.Server != "edge.example:4443" || c.Region != "eu" || c.Transport != "tcp" {
		t.Fatalf("file not applied: %+v", c)
	}
	if tn, ok := c.Tunnels["web"]; !ok || tn.Addr != "localhost:3000" || tn.Subdomain != "myapp" {
		t.Fatalf("tunnel not parsed: %+v", c.Tunnels)
	}
}

func TestEnvOverridesFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "trqsh.yml")
	if err := writeFile(t, path, "version: 1\nserver: file.example:4443\n"); err != nil {
		t.Fatal(err)
	}
	t.Setenv("TRQSH_SERVER", "env.example:4443")
	t.Setenv("TRQSH_API_KEY", "tq_from_env")
	c, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if c.Server != "env.example:4443" {
		t.Errorf("env should override file: got %q", c.Server)
	}
	if c.APIKey != "tq_from_env" {
		t.Errorf("api key from env not applied: %q", c.APIKey)
	}
}

func TestSaveRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "sub", "trqsh.yml")
	c := DefaultConfig()
	c.APIKey = "tq_saved"
	c.Server = "roundtrip:4443"
	if err := c.Save(path); err != nil {
		t.Fatalf("Save: %v", err)
	}
	got, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got.APIKey != "tq_saved" || got.Server != "roundtrip:4443" {
		t.Fatalf("round-trip mismatch: %+v", got)
	}
}

func TestLoadMigratesLegacyHostedEndpoints(t *testing.T) {
	for _, name := range []string{"TRQSH_SERVER", "TRQSH_API_URL", "TRQSH_API_KEY"} {
		t.Setenv(name, "")
	}
	for _, tc := range []struct{ name, server, api, wantServer, wantAPI string }{
		{"legacy", "wss://tunnel.trqsh.uz/_trqsh/agent", "https://tunnel.trqsh.uz/", DefaultServer, DefaultAPIBase},
		{"custom", "edge.example:4443", "https://api.example", "edge.example:4443", "https://api.example"},
		{"custom-server", "edge.example:4443", "https://tunnel.trqsh.uz", "edge.example:4443", DefaultAPIBase},
		{"custom-api", "tunnel.trqsh.uz:4443", "http://127.0.0.1:8081", DefaultServer, "http://127.0.0.1:8081"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "trqsh.yml")
			data := "api_key: preserved-key\nserver: " + tc.server + "\napi_base: " + tc.api + "\ntunnels:\n  web:\n    proto: http\n    addr: localhost:3000\n"
			if err := writeFile(t, path, data); err != nil {
				t.Fatal(err)
			}
			cfg, err := Load(path)
			if err != nil {
				t.Fatal(err)
			}
			if cfg.Server != tc.wantServer || cfg.APIBase != tc.wantAPI || cfg.APIKey != "preserved-key" || cfg.Tunnels["web"].Addr != "localhost:3000" {
				t.Fatal("migration did not preserve the expected endpoints, credentials and tunnels")
			}
			got, err := os.ReadFile(path)
			if err != nil || string(got) != data {
				t.Fatal("loading configuration should not rewrite it")
			}
			t.Setenv("TRQSH_SERVER", "explicit.example:4443")
			t.Setenv("TRQSH_API_URL", "https://explicit.example")
			cfg, err = Load(path)
			if err != nil || cfg.Server != "explicit.example:4443" || cfg.APIBase != "https://explicit.example" {
				t.Fatal("explicit overrides must win after migration")
			}
		})
	}
}

func writeFile(t *testing.T, path, content string) error {
	t.Helper()
	return os.WriteFile(path, []byte(content), 0o600)
}

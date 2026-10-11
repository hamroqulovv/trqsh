package cli

import (
	"os"
	"path/filepath"
	"testing"
)

func TestOnboardingPersistenceAndConfigIsolation(t *testing.T) {
	t.Setenv("CI", "")
	t.Setenv("TERM", "xterm")
	dir := t.TempDir()
	a := filepath.Join(dir, "a.yml")
	b := filepath.Join(dir, "b.yml")
	if !needsOnboarding(a, "", "") {
		t.Fatal("new user should see setup")
	}
	if onboardingPath(a) == onboardingPath(b) {
		t.Fatal("config states collide")
	}
	for _, status := range []string{"dismissed", "completed"} {
		if err := saveOnboarding(a, status); err != nil {
			t.Fatal(err)
		}
		if needsOnboarding(a, "", "") {
			t.Fatal("setup repeated after", status)
		}
	}
	if !needsOnboarding(b, "", "") {
		t.Fatal("other config should be independent")
	}
	if err := os.WriteFile(b, []byte("version: 1\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if needsOnboarding(b, "", "") {
		t.Fatal("existing user interrupted")
	}
	if needsOnboarding(filepath.Join(dir, "c.yml"), "token", "") || needsOnboarding(filepath.Join(dir, "c.yml"), "", "http 3000") {
		t.Fatal("explicit intent interrupted")
	}
}

func TestOnboardingCorruptStateAndCI(t *testing.T) {
	t.Setenv("CI", "")
	t.Setenv("TERM", "xterm")
	config := filepath.Join(t.TempDir(), "trqsh.yml")
	if err := os.WriteFile(onboardingPath(config), []byte("broken"), 0600); err != nil {
		t.Fatal(err)
	}
	if !needsOnboarding(config, "", "") {
		t.Fatal("corrupt state prevented recovery")
	}
	t.Setenv("CI", "true")
	if needsOnboarding(config, "", "") {
		t.Fatal("setup in CI")
	}
}

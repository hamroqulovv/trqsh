package cli

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

type onboardingState struct {
	Version int    `json:"version"`
	Status  string `json:"status"`
}

func onboardingPath(config string) string {
	abs, err := filepath.Abs(config)
	if err != nil {
		abs = filepath.Clean(config)
	}
	key := abs
	if runtime.GOOS == "windows" {
		key = strings.ToLower(key)
	}
	hash := sha256.Sum256([]byte(key))
	return filepath.Join(filepath.Dir(abs), fmt.Sprintf("onboarding.%x.json", hash[:12]))
}

func needsOnboarding(config, apiKey, initial string) bool {
	if strings.TrimSpace(initial) != "" || strings.TrimSpace(apiKey) != "" || os.Getenv("CI") != "" || os.Getenv("TERM") == "dumb" {
		return false
	}
	var state onboardingState
	data, err := os.ReadFile(onboardingPath(config))
	if err == nil && json.Unmarshal(data, &state) == nil && state.Version == 1 && (state.Status == "completed" || state.Status == "dismissed") {
		return false
	}
	_, err = os.Stat(config)
	return os.IsNotExist(err)
}

func saveOnboarding(config, status string) error {
	if status != "completed" && status != "dismissed" {
		return fmt.Errorf("invalid setup status")
	}
	target := onboardingPath(config)
	if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(target), ".onboarding-*")
	if err != nil {
		return err
	}
	defer func() { _ = os.Remove(f.Name()) }()
	if err := json.NewEncoder(f).Encode(onboardingState{Version: 1, Status: status}); err != nil {
		_ = f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), target)
}

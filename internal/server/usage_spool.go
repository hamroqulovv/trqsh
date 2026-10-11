package server

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/trqsh-uz/trqsh/pkg/authz"
)

func (u *usageAgg) enableSpool(dir string) error {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	root, err := os.OpenRoot(dir)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "usage_") || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		data, err := root.ReadFile(entry.Name())
		if err != nil {
			return err
		}
		var window authz.Usage
		if err := json.Unmarshal(data, &window); err != nil {
			return fmt.Errorf("%s: %w", entry.Name(), err)
		}
		if window.EventID+".json" != entry.Name() || window.AccountID == "" || window.WindowEnd.IsZero() {
			return fmt.Errorf("invalid usage spool file %s", entry.Name())
		}
		u.pending = append(u.pending, &window)
	}
	u.spoolDir = dir
	return nil
}

func (u *usageAgg) persistWindow(w *authz.Usage) error {
	if u.redisSpool != nil {
		return u.redisSpool.save(w)
	}
	if u.spoolDir == "" {
		return nil
	}
	path := filepath.Join(u.spoolDir, w.EventID+".json")
	if _, err := os.Stat(path); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	file, err := os.CreateTemp(u.spoolDir, ".usage-*")
	if err != nil {
		return err
	}
	defer func() { _ = file.Close(); _ = os.Remove(file.Name()) }()
	if err := json.NewEncoder(file).Encode(w); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}

func (u *usageAgg) removeWindow(w *authz.Usage) error {
	if u.redisSpool != nil {
		return u.redisSpool.remove(w)
	}
	if u.spoolDir == "" {
		return nil
	}
	err := os.Remove(filepath.Join(u.spoolDir, w.EventID+".json"))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"sync"
	"time"

	"github.com/trqsh-uz/trqsh/pkg/authz"
)

// usageKey identifies a metering bucket.
type usageKey struct {
	accountID string
	tunnelID  string
}

// usageAgg aggregates per-account/per-tunnel traffic in short windows and
// flushes them to the entitlements plane (billing) via ReportUsage.
type usageAgg struct {
	ent   authz.Entitlements
	every time.Duration

	mu         sync.Mutex
	flushMu    sync.Mutex
	pending    []*authz.Usage
	spoolDir   string
	redisSpool *redisUsageSpool
	windows    map[usageKey]*authz.Usage
	stop       chan struct{}
	wg         sync.WaitGroup
}

func newUsageAgg(ent authz.Entitlements, every time.Duration) *usageAgg {
	return &usageAgg{
		ent:     ent,
		every:   every,
		windows: make(map[usageKey]*authz.Usage),
		stop:    make(chan struct{}),
	}
}

// record adds traffic to the current window for an account/tunnel.
func (u *usageAgg) record(accountID, tunnelID string, bytesIn, bytesOut, requests int64) {
	if accountID == "" {
		return
	}
	k := usageKey{accountID: accountID, tunnelID: tunnelID}
	u.mu.Lock()
	defer u.mu.Unlock()
	w := u.windows[k]
	if w == nil {
		var nonce [16]byte
		_, _ = rand.Read(nonce[:])
		w = &authz.Usage{EventID: "usage_" + hex.EncodeToString(nonce[:]), AccountID: accountID, TunnelID: tunnelID, WindowStart: time.Now()}
		u.windows[k] = w
	}
	w.BytesIn += bytesIn
	w.BytesOut += bytesOut
	w.Requests += requests
}

// run flushes accumulated windows on a ticker until Stop.
func (u *usageAgg) run() {
	u.wg.Add(1)
	go func() {
		defer u.wg.Done()
		t := time.NewTicker(u.every)
		defer t.Stop()
		for {
			select {
			case <-u.stop:
				u.flush()
				return
			case <-t.C:
				u.flush()
			}
		}
	}()
}

func (u *usageAgg) flush() {
	u.flushMu.Lock()
	defer u.flushMu.Unlock()
	u.mu.Lock()
	now := time.Now()
	for _, w := range u.windows {
		w.WindowEnd = now
		u.pending = append(u.pending, w)
	}
	u.windows = make(map[usageKey]*authz.Usage)
	u.mu.Unlock()

	failed := make([]*authz.Usage, 0)
	ready := make([]*authz.Usage, 0, len(u.pending))
	// Persist the entire snapshot before any network request can stall. A slow
	// API must not leave the remaining frozen batches only in process memory.
	for _, w := range u.pending {
		if w.BytesIn == 0 && w.BytesOut == 0 && w.Requests == 0 {
			continue
		}
		if err := u.persistWindow(w); err != nil {
			slog.Error("usage spool write failed", "err", err)
			failed = append(failed, w)
			continue
		}
		ready = append(ready, w)
	}
	for _, w := range ready {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		err := u.ent.ReportUsage(ctx, *w)
		cancel()
		if err == nil {
			err = u.removeWindow(w)
		}
		if err != nil {
			failed = append(failed, w)
		}
	}
	u.pending = failed
}

// Stop flushes and stops the aggregator.
func (u *usageAgg) Stop() {
	close(u.stop)
	u.wg.Wait()
}

package server

import (
	"context"
	"time"

	"github.com/trqsh-uz/trqsh/internal/entitlerpc"
)

// tunnelSyncInterval is how often the edge tells the control plane which
// tunnels it serves.
const tunnelSyncInterval = time.Minute

// runTunnelSync reports the live tunnel set at startup, which closes whatever a
// previous run of this edge left "active" in tunnel history, and then every
// tunnelSyncInterval, which repairs close events that never arrived (the API
// was down, or the report timed out).
func (s *Server) runTunnelSync(ctx context.Context) {
	t := time.NewTicker(tunnelSyncInterval)
	defer t.Stop()
	for {
		s.syncTunnels(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// syncTunnels sends one snapshot of the tunnels this edge serves, counting those
// whose close event is still being reported.
func (s *Server) syncTunnels(ctx context.Context) {
	// Taken before the snapshot: a tunnel missing from it joined the hub later,
	// and its startedAt (set after that) is after `at`, so the API keeps it.
	at := time.Now()
	live := []entitlerpc.TunnelRef{}
	add := func(bt *boundTunnel) {
		if bt.session != nil {
			live = append(live, entitlerpc.TunnelRef{SessionID: bt.session.sessionID, TunnelID: bt.clientTunnelID})
		}
	}
	for _, bt := range s.hub.snapshotTunnels() {
		add(bt)
	}
	s.closing.Range(func(k, _ any) bool {
		add(k.(*boundTunnel))
		return true
	})
	rctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	err := s.reporter.SyncTunnels(rctx, entitlerpc.TunnelSync{EdgeID: s.cfg.EdgeID, Live: live, At: at})
	if err != nil && ctx.Err() == nil {
		s.log.Warn("tunnel sync failed", "err", err)
	}
}

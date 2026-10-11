package agent

import (
	"errors"
	"math/rand"
	"time"

	"github.com/trqsh-uz/trqsh/pkg/proto"
)

const (
	reconnectBase = 500 * time.Millisecond
	reconnectMax  = 30 * time.Second
)

// handleSessionDown marks the session dead (once per generation) and kicks off
// reconnection, unless the agent is shutting down.
func (a *Agent) handleSessionDown(gen uint64, cause error) {
	a.mu.Lock()
	if gen != a.sessGen.Load() || !a.connected {
		a.mu.Unlock()
		return
	}
	a.connected = false
	a.control = nil
	closed := a.closed
	identityGen := a.identityGen
	sess := a.sess
	a.sess = nil
	prev := make([]*activeTunnel, 0, len(a.tunnels))
	for _, t := range a.tunnels {
		prev = append(prev, t)
	}
	a.mu.Unlock()
	if sess != nil {
		_ = sess.CloseWithError(0, "session down")
	}

	a.log.Warn("session down", "cause", cause)
	st := a.Status()
	a.emit(Event{Type: "status", Status: &st})

	if closed {
		return
	}
	go a.reconnect(prev, identityGen)
}

// reconnect re-dials with exponential backoff + jitter, then re-binds every
// previously active tunnel (restoring reserved subdomains / ports).
func (a *Agent) reconnect(prev []*activeTunnel, identityGen uint64) {
	backoff := reconnectBase
	for {
		select {
		case <-a.ctx.Done():
			return
		default:
		}
		a.mu.Lock()
		closed := a.closed || a.loggedOut || a.identityGen != identityGen
		a.mu.Unlock()
		if closed {
			return
		}

		if err := a.connect(a.ctx); err == nil {
			a.mu.Lock()
			valid := a.identityGen == identityGen && !a.loggedOut
			edge := a.cfg.Server
			a.mu.Unlock()
			if !valid {
				return
			}
			a.rebindAll(prev)
			a.log.Info("reconnected", "edge", edge)
			return
		}

		sleep := backoff + time.Duration(rand.Int63n(int64(backoff/2+1))) // #nosec G404 -- reconnect jitter, not security-sensitive
		if sleep > reconnectMax {
			sleep = reconnectMax
		}
		select {
		case <-a.ctx.Done():
			return
		case <-time.After(sleep):
		}
		if backoff < reconnectMax {
			backoff *= 2
		}
	}
}

func (a *Agent) rebindAll(prev []*activeTunnel) {
	for _, old := range prev {
		spec := old.spec
		// Restore the same public endpoint where possible.
		// Keep the original reservation. A randomly assigned hostname is not
		// a reservation, and TCP/custom-domain assignments are not subdomains.
		if spec.RemotePort == 0 && old.assignedPort != 0 {
			spec.RemotePort = old.assignedPort
		}
		a.mu.Lock()
		if a.tunnels[old.clientTunnelID] != old || old.rebinding || a.loggedOut || a.closed {
			a.mu.Unlock()
			continue
		}
		old.rebinding = true
		identityGen := a.identityGen
		a.mu.Unlock()
		if a.rebindOne(old, spec, identityGen) {
			go func() {
				defer func() { a.mu.Lock(); old.rebinding = false; a.mu.Unlock() }()
				for backoff := reconnectBase; backoff <= 8*time.Second; backoff *= 2 {
					select {
					case <-a.ctx.Done():
						return
					case <-time.After(backoff):
					}
					if !a.rebindOne(old, spec, identityGen) {
						return
					}
				}
			}()
		} else {
			a.mu.Lock()
			old.rebinding = false
			a.mu.Unlock()
		}
	}
}

// A failed rebind remains visible and can be stopped or retried on the next
// reconnect. Only transient failures are retried on the current session.
func (a *Agent) rebindOne(old *activeTunnel, spec TunnelSpec, identityGen uint64) bool {
	a.mu.Lock()
	valid := a.tunnels[old.clientTunnelID] == old && a.identityGen == identityGen && !a.closed && !a.loggedOut
	a.mu.Unlock()
	if !valid {
		return false
	}
	bound, err := a.bind(a.ctx, spec, identityGen)
	if err == nil {
		a.mu.Lock()
		valid = a.tunnels[old.clientTunnelID] == old && a.identityGen == identityGen
		if valid {
			delete(a.tunnels, old.clientTunnelID)
		}
		a.mu.Unlock()
		if !valid {
			_ = a.StopTunnel(a.ctx, bound.ID)
		}
		return false
	}
	a.mu.Lock()
	old.status = "error"
	view := old.view()
	a.mu.Unlock()
	a.emit(Event{Type: "tunnel", Tunnel: &view})
	a.emit(Event{Type: "error", Err: "re-bind " + spec.Name + ": " + err.Error()})
	var bindError *Error
	if errors.As(err, &bindError) {
		switch bindError.Code {
		case proto.CodeInternal, proto.CodeSubdomainTaken, proto.CodePortUnavailable, proto.CodeUpstreamUnreachable:
			return true
		}
	}
	return false
}

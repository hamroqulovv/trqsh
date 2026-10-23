package api

import (
	"crypto/subtle"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/trqsh-uz/trqsh/internal/api/store"
	"github.com/trqsh-uz/trqsh/internal/entitlerpc"
	"github.com/trqsh-uz/trqsh/pkg/authz"
)

// mountInternal registers the token-guarded entitlements RPC used by the edge.
func (s *Server) mountInternal(r chi.Router) {
	r.Group(func(r chi.Router) {
		r.Use(s.internalTokenGuard)
		r.Post(entitlerpc.PathAuthenticate, s.rpcAuthenticate)
		r.Post(entitlerpc.PathCheckBind, s.rpcCheckBind)
		r.Post(entitlerpc.PathReportUsage, s.rpcReportUsage)
		r.Post(entitlerpc.PathReportTunnel, s.rpcReportTunnel)
		r.Post(entitlerpc.PathSyncTunnels, s.rpcSyncTunnels)
	})
}

func (s *Server) internalTokenGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got := r.Header.Get(entitlerpc.HeaderToken)
		if s.cfg.InternalToken == "" || subtle.ConstantTimeCompare([]byte(got), []byte(s.cfg.InternalToken)) != 1 {
			writeError(w, http.StatusUnauthorized, "invalid internal token")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) rpcAuthenticate(w http.ResponseWriter, r *http.Request) {
	var req entitlerpc.AuthRequest
	if !decode(w, r, &req) {
		return
	}
	accountID, plan, err := s.ent.Authenticate(r.Context(), req.APIKey)
	if err != nil {
		writeJSON(w, http.StatusOK, entitlerpc.AuthResponse{Error: "invalid api key"})
		return
	}
	writeJSON(w, http.StatusOK, entitlerpc.AuthResponse{AccountID: accountID, Plan: plan})
}

func (s *Server) rpcCheckBind(w http.ResponseWriter, r *http.Request) {
	var req entitlerpc.CheckBindRequest
	if !decode(w, r, &req) {
		return
	}
	dec, err := s.ent.CheckBind(r.Context(), authz.BindRequest{
		APIKey: req.APIKey, Type: req.Type, Subdomain: req.Subdomain,
		CustomHost: req.CustomHost, RemotePort: req.RemotePort, Region: req.Region,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, entitlerpc.CheckBindResponse{
		Allow:             dec.Allow,
		AccountID:         dec.AccountID,
		Plan:              dec.Plan,
		Limits:            dec.Limits,
		AssignedSubdomain: dec.AssignedSubdomain,
		ErrorCode:         dec.ErrorCode,
		ErrorMessage:      dec.ErrorMessage,
	})
}

func (s *Server) rpcReportUsage(w http.ResponseWriter, r *http.Request) {
	var req entitlerpc.UsageRequest
	if !decode(w, r, &req) {
		return
	}
	err := s.ent.ReportUsage(r.Context(), authz.Usage{
		EventID:   req.EventID,
		AccountID: req.AccountID, TunnelID: req.TunnelID, BytesIn: req.BytesIn, BytesOut: req.BytesOut,
		Requests: req.Requests, WindowStart: req.WindowStart, WindowEnd: req.WindowEnd,
	})
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "usage storage unavailable")
		return
	}
	w.WriteHeader(http.StatusOK)
}

// rpcReportTunnel records a tunnel open/close event for history. The agent's
// public IP (req.ClientIP) is resolved to a country/city here — geo lives in the
// control plane so the edge stays lean and the mapping is consistent. Best-effort:
// storage errors are swallowed (the edge treats this as fire-and-forget), and an
// empty AccountID (e.g. stub entitlements) is ignored to respect the org FK.
func (s *Server) rpcReportTunnel(w http.ResponseWriter, r *http.Request) {
	var req entitlerpc.TunnelReport
	if !decode(w, r, &req) {
		return
	}
	if req.AccountID == "" {
		w.WriteHeader(http.StatusOK)
		return
	}
	at := req.At
	if at.IsZero() {
		at = time.Now()
	}
	switch req.Action {
	case "open":
		loc := s.geo.FromIP(r.Context(), req.ClientIP)
		_, _ = s.store.RecordTunnelOpen(r.Context(), store.TunnelSession{
			OrgID: req.AccountID, EdgeID: req.EdgeID, SessionID: req.SessionID, TunnelID: req.TunnelID,
			Type: req.Type, PublicURL: req.PublicURL, Host: req.Host, Port: req.Port, Region: req.Region,
			ClientIP: req.ClientIP, Country: loc.Country, City: loc.City, StartedAt: at,
		})
	case "close":
		_ = s.store.CloseTunnelSession(r.Context(), req.EdgeID, req.SessionID, req.TunnelID, at,
			req.BytesIn, req.BytesOut, req.Requests)
	}
	w.WriteHeader(http.StatusOK)
}

// rpcSyncTunnels reconciles tunnel history with what an edge actually serves.
// Close events are fire-and-forget, so an edge restart or crash, or an API
// outage, leaves rows "active" after their tunnels are gone, and the dashboard
// would keep showing them as live. The edge sends its full live set at startup
// and then periodically; any other active row of that edge is closed.
func (s *Server) rpcSyncTunnels(w http.ResponseWriter, r *http.Request) {
	var req entitlerpc.TunnelSync
	if !decode(w, r, &req) {
		return
	}
	if req.EdgeID == "" || req.At.IsZero() {
		writeError(w, http.StatusBadRequest, "edge_id and at are required")
		return
	}
	live := make([]store.TunnelKey, 0, len(req.Live))
	for _, t := range req.Live {
		live = append(live, store.TunnelKey{SessionID: t.SessionID, TunnelID: t.TunnelID})
	}
	closed, err := s.store.CloseAbsentTunnelSessions(r.Context(), req.EdgeID, live, req.At)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "tunnel history unavailable")
		return
	}
	if closed > 0 {
		s.log.Info("closed tunnel sessions the edge no longer serves", "edge", sanitizeLog(req.EdgeID), "count", closed)
	}
	w.WriteHeader(http.StatusOK)
}

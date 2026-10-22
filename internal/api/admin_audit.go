package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/trqsh-uz/trqsh/internal/api/store"
)

// Shared plumbing for the admin console handlers: the audit trail and uniform
// error mapping. Every mutation under /v1/admin calls s.audit after it succeeds.

// audit appends one row to the admin audit log. A failed write is logged but never
// fails the request: the change has already happened and rolling it back by hand
// would be worse than a missing log line (which the error log still records).
func (s *Server) audit(r *http.Request, action, targetType, targetID, summary string, detail map[string]any) {
	entry := store.AuditEntry{
		Actor: s.cfg.AdminUser, Action: action, TargetType: targetType, TargetID: targetID,
		Summary: summary, Detail: detail, IP: clientIP(r, s.cfg.TrustProxy),
	}
	if err := s.store.AppendAudit(r.Context(), entry); err != nil {
		s.log.Error("admin audit write failed", "action", action, "target", sanitizeLog(targetID), "err", err)
	}
	s.log.Info("admin action", "action", action, "target_type", targetType, "target", sanitizeLog(targetID), "summary", sanitizeLog(summary))
}

// adminFail maps a store error to a response without leaking internals: known
// sentinels become 404/409, anything else is logged and reported generically.
func (s *Server) adminFail(w http.ResponseWriter, r *http.Request, err error, what string) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, what+" not found")
	case errors.Is(err, store.ErrConflict):
		writeError(w, http.StatusConflict, what+" conflicts with an existing record")
	default:
		s.log.Error("admin request failed", "path", r.URL.Path, "err", err)
		writeError(w, http.StatusInternalServerError, "internal error")
	}
}

// cleanReason trims an operator-supplied reason and bounds its length.
func cleanReason(v string) string {
	v = strings.TrimSpace(v)
	if len(v) > 300 {
		v = v[:300]
	}
	return v
}

func pathID(r *http.Request, name string) string { return strings.TrimSpace(chi.URLParam(r, name)) }

// handleAdminAudit lists the audit log, newest first. Filters: ?q= free text,
// ?action=, ?target_type=, ?target_id=.
func (s *Server) handleAdminAudit(w http.ResponseWriter, r *http.Request) {
	limit, offset := parsePage(r, 50, 200)
	q := r.URL.Query()
	entries, total, err := s.store.ListAudit(r.Context(), store.AuditQuery{
		Limit: limit, Offset: offset, Search: q.Get("q"),
		Action: q.Get("action"), TargetType: q.Get("target_type"), TargetID: q.Get("target_id"),
	})
	if err != nil {
		s.adminFail(w, r, err, "audit log")
		return
	}
	if entries == nil {
		entries = []store.AuditEntry{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": entries, "total": total, "limit": limit, "offset": offset})
}

// recentAudit returns the newest audit rows for one object, for detail views.
func (s *Server) recentAudit(r *http.Request, targetType, targetID string, n int) []store.AuditEntry {
	entries, _, err := s.store.ListAudit(r.Context(), store.AuditQuery{Limit: n, TargetType: targetType, TargetID: targetID})
	if err != nil || entries == nil {
		return []store.AuditEntry{}
	}
	return entries
}

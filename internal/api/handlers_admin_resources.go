package api

import (
	"net/http"
	"time"

	"github.com/trqsh-uz/trqsh/internal/api/store"
)

// Cross-org resource directories and their admin-only mutations: API keys,
// subdomain reservations, custom domains, subscriptions and the metering queue.

func adminQuery(r *http.Request) (store.Query, int, int) {
	limit, offset := parsePage(r, 50, 200)
	return store.Query{Limit: limit, Offset: offset, Search: r.URL.Query().Get("q")}, limit, offset
}

func (s *Server) handleAdminAPIKeys(w http.ResponseWriter, r *http.Request) {
	q, limit, offset := adminQuery(r)
	keys, total, err := s.store.ListAllAPIKeys(r.Context(), q, r.URL.Query().Get("state"))
	if err != nil {
		s.adminFail(w, r, err, "api keys")
		return
	}
	if keys == nil {
		keys = []store.AdminAPIKey{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"keys": keys, "total": total, "limit": limit, "offset": offset})
}

func (s *Server) handleAdminAPIKeyRevoke(w http.ResponseWriter, r *http.Request) {
	id := pathID(r, "id")
	if err := s.store.AdminRevokeAPIKey(r.Context(), id, time.Now()); err != nil {
		s.adminFail(w, r, err, "api key")
		return
	}
	s.audit(r, "apikey.revoke", "apikey", id, "Revoked API key", nil)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAdminSubdomains(w http.ResponseWriter, r *http.Request) {
	q, limit, offset := adminQuery(r)
	subs, total, err := s.store.ListAllSubdomains(r.Context(), q)
	if err != nil {
		s.adminFail(w, r, err, "subdomains")
		return
	}
	if subs == nil {
		subs = []store.AdminSubdomain{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"subdomains": subs, "total": total, "limit": limit, "offset": offset})
}

func (s *Server) handleAdminSubdomainRelease(w http.ResponseWriter, r *http.Request) {
	id := pathID(r, "id")
	if err := s.store.AdminReleaseSubdomain(r.Context(), id); err != nil {
		s.adminFail(w, r, err, "subdomain")
		return
	}
	s.audit(r, "subdomain.release", "subdomain", id, "Released subdomain", nil)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAdminDomains(w http.ResponseWriter, r *http.Request) {
	q, limit, offset := adminQuery(r)
	domains, total, err := s.store.ListAllCustomDomains(r.Context(), q, r.URL.Query().Get("status"))
	if err != nil {
		s.adminFail(w, r, err, "domains")
		return
	}
	if domains == nil {
		domains = []store.AdminDomain{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"domains": domains, "total": total, "limit": limit, "offset": offset})
}

// handleAdminDomainVerify marks a domain verified without a DNS check. That is an
// operator override (e.g. the customer proved ownership out of band), so it is
// audited like any other change.
func (s *Server) handleAdminDomainVerify(w http.ResponseWriter, r *http.Request) {
	id := pathID(r, "id")
	if err := s.store.AdminVerifyDomain(r.Context(), id, time.Now()); err != nil {
		s.adminFail(w, r, err, "domain")
		return
	}
	s.audit(r, "domain.verify", "domain", id, "Force-verified domain", nil)
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "cert_status": "verified"})
}

func (s *Server) handleAdminDomainDelete(w http.ResponseWriter, r *http.Request) {
	id := pathID(r, "id")
	if err := s.store.AdminDeleteDomain(r.Context(), id); err != nil {
		s.adminFail(w, r, err, "domain")
		return
	}
	s.audit(r, "domain.delete", "domain", id, "Deleted domain", nil)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAdminSubscriptions(w http.ResponseWriter, r *http.Request) {
	q, limit, offset := adminQuery(r)
	subs, total, err := s.store.ListSubscriptions(r.Context(), q, r.URL.Query().Get("status"))
	if err != nil {
		s.adminFail(w, r, err, "subscriptions")
		return
	}
	if subs == nil {
		subs = []store.AdminSubscription{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"subscriptions": subs, "total": total, "limit": limit, "offset": offset})
}

// handleAdminBillingQueue shows metered usage waiting to be pushed to Stripe, so
// an operator can see whether the metering loop is keeping up.
func (s *Server) handleAdminBillingQueue(w http.ResponseWriter, r *http.Request) {
	pending, err := s.store.PendingMeteredUsage(r.Context(), 200)
	if err != nil {
		s.adminFail(w, r, err, "billing queue")
		return
	}
	if pending == nil {
		pending = []store.MeteredUsage{}
	}
	var oldest *time.Time
	var bandwidth, requests int64
	for _, p := range pending {
		if oldest == nil || p.CreatedAt.Before(*oldest) {
			t := p.CreatedAt
			oldest = &t
		}
		switch p.Metric {
		case "bandwidth_bytes":
			bandwidth += p.Quantity
		case "requests":
			requests += p.Quantity
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"pending": pending, "count": len(pending), "oldest": oldest,
		"pending_bandwidth_bytes": bandwidth, "pending_requests": requests,
		"stripe_enabled": s.billing.Config().Enabled(),
	})
}

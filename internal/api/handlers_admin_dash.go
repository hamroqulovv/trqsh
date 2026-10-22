package api

import (
	"net/http"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/trqsh-uz/trqsh/internal/api/store"
)

// This file holds the read-only, whole-deployment views behind the approve.<base>
// admin console: a fleet overview, account directories, the live/historical
// tunnel list with geo, global search, usage charts and the system snapshot. All
// handlers are mounted under requireAdmin (admin session cookie), never exposed to
// normal user JWTs. Mutations live in handlers_admin_{users,orgs,resources}.go.

// handleAdminStats returns the fleet overview: headline counts plus the geo
// breakdown of tunnel sessions, for the dashboard's top cards + map.
func (s *Server) handleAdminStats(w http.ResponseWriter, r *http.Request) {
	stats, err := s.store.AdminOverview(r.Context())
	if err != nil {
		s.adminFail(w, r, err, "stats")
		return
	}
	geoAll, _ := s.store.TunnelCountryBreakdown(r.Context(), "", false)
	geoActive, _ := s.store.TunnelCountryBreakdown(r.Context(), "", true)
	writeJSON(w, http.StatusOK, map[string]any{
		"stats":        stats,
		"geo":          geoAll,
		"geo_active":   geoActive,
		"regions":      s.geo.Regions(),
		"generated_at": time.Now().UTC(),
	})
}

// handleAdminUsage returns the fleet-wide traffic time series and the busiest
// orgs. ?days= (1–365, default 30) sets the window; windows of two days or less
// are bucketed hourly, longer ones daily.
func (s *Server) handleAdminUsage(w http.ResponseWriter, r *http.Request) {
	days := 30
	if v, err := strconv.Atoi(r.URL.Query().Get("days")); err == nil && v > 0 {
		days = min(v, 365)
	}
	bucket := "day"
	if days <= 2 {
		bucket = "hour"
	}
	since := time.Now().AddDate(0, 0, -days)
	series, err := s.store.UsageSeriesAll(r.Context(), since, bucket)
	if err != nil {
		s.adminFail(w, r, err, "usage")
		return
	}
	top, err := s.store.TopOrgsByUsage(r.Context(), since, 8)
	if err != nil {
		s.adminFail(w, r, err, "usage")
		return
	}
	if series == nil {
		series = []store.UsageBucket{}
	}
	if top == nil {
		top = []store.OrgUsage{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"days": days, "bucket": bucket, "since": since.UTC(), "series": series, "top_orgs": top,
	})
}

// handleAdminUsers lists accounts (newest first) with their primary org + plan,
// so an admin can browse/search the user base. ?q= filters by email/name.
func (s *Server) handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	limit, offset := parsePage(r, 50, 200)
	q := r.URL.Query().Get("q")
	users, err := s.store.ListUsers(r.Context(), limit, offset, q)
	if err != nil {
		s.adminFail(w, r, err, "users")
		return
	}
	total, _ := s.store.CountUsers(r.Context(), q)
	out := make([]map[string]any, 0, len(users))
	for _, u := range users {
		row := map[string]any{
			"id": u.ID, "email": u.Email, "name": u.Name, "avatar_url": u.AvatarURL,
			"oauth_provider": u.OAuthProvider, "created_at": u.CreatedAt,
			"disabled_at": u.DisabledAt, "disabled_reason": u.DisabledReason,
		}
		// Best-effort enrichment with the user's primary org + effective plan.
		if orgs, e := s.store.OrgsForUser(r.Context(), u.ID); e == nil && len(orgs) > 0 {
			row["org_id"] = orgs[0].ID
			row["plan"] = effectivePlan(orgs[0])
			row["plan_expires_at"] = orgs[0].PlanExpiresAt
			row["org_suspended_at"] = orgs[0].SuspendedAt
			row["orgs"] = len(orgs)
		}
		out = append(out, row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": out, "total": total, "limit": limit, "offset": offset})
}

// handleAdminOrgs lists orgs (newest first) with member count + effective plan.
// ?plan= filters by stored plan code, ?q= by name or id.
func (s *Server) handleAdminOrgs(w http.ResponseWriter, r *http.Request) {
	limit, offset := parsePage(r, 50, 200)
	plan, q := r.URL.Query().Get("plan"), r.URL.Query().Get("q")
	orgs, err := s.store.ListOrgs(r.Context(), limit, offset, plan, q)
	if err != nil {
		s.adminFail(w, r, err, "orgs")
		return
	}
	total, _ := s.store.CountOrgs(r.Context(), plan, q)
	out := make([]map[string]any, 0, len(orgs))
	for _, o := range orgs {
		members, _ := s.store.ListOrgMembers(r.Context(), o.ID)
		row := adminOrgRow(o)
		row["members"] = len(members)
		out = append(out, row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"orgs": out, "total": total, "limit": limit, "offset": offset})
}

// adminOrgRow is the org shape every admin view shares.
func adminOrgRow(o store.Org) map[string]any {
	return map[string]any{
		"id": o.ID, "name": o.Name,
		"plan":            effectivePlan(o),
		"stored_plan":     o.Plan,
		"plan_expires_at": o.PlanExpiresAt,
		"stripe_customer": o.StripeCustomerID,
		"suspended_at":    o.SuspendedAt, "suspended_reason": o.SuspendedReason,
		"created_at": o.CreatedAt,
	}
}

// handleAdminTunnels lists tunnel sessions across ALL orgs, newest first, for the
// fleet view. ?active=true limits to live tunnels; ?type= ?region= ?country=
// ?org= ?q= narrow it; ?limit/?offset paginate. The total backs the pager.
func (s *Server) handleAdminTunnels(w http.ResponseWriter, r *http.Request) {
	limit, offset := parsePage(r, 50, 200)
	qv := r.URL.Query()
	f := store.TunnelSessionFilter{
		ActiveOnly: qv.Get("active") == "true", Limit: limit, Offset: offset,
		OrgID: qv.Get("org"), Type: qv.Get("type"), Region: qv.Get("region"),
		Country: qv.Get("country"), Search: qv.Get("q"),
	}
	sessions, err := s.store.ListTunnelSessions(r.Context(), f)
	if err != nil {
		s.adminFail(w, r, err, "tunnels")
		return
	}
	total, _ := s.store.CountTunnelSessionsWhere(r.Context(), f)
	if sessions == nil {
		sessions = []store.TunnelSession{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"sessions": sessions, "total": total, "limit": limit, "offset": offset,
	})
}

// handleAdminSearch backs the command palette: a few best matches per kind. The
// query must be at least two characters so a stray keystroke does not scan.
func (s *Server) handleAdminSearch(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	out := map[string]any{"q": q, "users": []any{}, "orgs": []any{}, "domains": []any{}, "subdomains": []any{}}
	if len(q) < 2 {
		writeJSON(w, http.StatusOK, out)
		return
	}
	const n = 5
	ctx := r.Context()
	if users, err := s.store.ListUsers(ctx, n, 0, q); err == nil {
		rows := make([]map[string]any, 0, len(users))
		for _, u := range users {
			rows = append(rows, map[string]any{"id": u.ID, "email": u.Email, "name": u.Name, "disabled": u.DisabledAt != nil})
		}
		out["users"] = rows
	}
	if orgs, err := s.store.ListOrgs(ctx, n, 0, "", q); err == nil {
		rows := make([]map[string]any, 0, len(orgs))
		for _, o := range orgs {
			rows = append(rows, map[string]any{"id": o.ID, "name": o.Name, "plan": effectivePlan(o), "suspended": o.SuspendedAt != nil})
		}
		out["orgs"] = rows
	}
	if d, _, err := s.store.ListAllCustomDomains(ctx, store.Query{Limit: n, Search: q}, ""); err == nil {
		out["domains"] = d
	}
	if d, _, err := s.store.ListAllSubdomains(ctx, store.Query{Limit: n, Search: q}); err == nil {
		out["subdomains"] = d
	}
	writeJSON(w, http.StatusOK, out)
}

// handleAdminPlans returns the plan catalog (read-only: limits live in code).
func (s *Server) handleAdminPlans(w http.ResponseWriter, _ *http.Request) {
	plans := make([]Plan, 0, len(Catalog))
	for _, p := range Catalog {
		plans = append(plans, p)
	}
	sort.Slice(plans, func(i, j int) bool { return plans[i].MaxConcurrentTunnels < plans[j].MaxConcurrentTunnels })
	writeJSON(w, http.StatusOK, map[string]any{"plans": plans})
}

// handleAdminSystem is the deployment snapshot. It reports which features are
// configured, never their secrets.
func (s *Server) handleAdminSystem(w http.ResponseWriter, _ *http.Request) {
	providers := make([]string, 0, len(s.providers))
	for k := range s.providers {
		providers = append(providers, k)
	}
	sort.Strings(providers)
	bc := s.billing.Config()
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	writeJSON(w, http.StatusOK, map[string]any{
		"service": "trqsh-control-api", "version": Version, "go_version": runtime.Version(),
		"os": runtime.GOOS, "arch": runtime.GOARCH, "cpus": runtime.NumCPU(),
		"started_at": processStart.UTC(), "uptime_seconds": int(time.Since(processStart).Seconds()),
		"goroutines": runtime.NumGoroutine(),
		"memory":     map[string]any{"alloc": mem.Alloc, "sys": mem.Sys, "heap_objects": mem.HeapObjects, "gc_runs": mem.NumGC},
		"config": map[string]any{
			"env": s.cfg.Env, "production": s.cfg.IsProduction(), "base_domain": s.cfg.BaseDomain,
			"public_url": s.cfg.PublicURL, "app_url": s.cfg.AppURL, "qr_url": s.cfg.QRURL,
			"store": storeKind(s.cfg), "redis": s.cfg.RedisURL != "", "trust_proxy": s.cfg.TrustProxy,
			"dev_auth": s.cfg.DevAuth, "oauth_providers": providers,
			"db_max_open_conns": s.cfg.DBMaxOpenConns, "metrics_addr": s.cfg.MetricsAddr,
		},
		"billing": map[string]any{
			"stripe_enabled": bc.Enabled(), "webhook_secret_set": bc.WebhookSecret != "",
			"metering_interval": bc.MeteringInterval.String(), "trial_days": bc.TrialDays,
			"dunning_grace": bc.DunningGrace.String(),
		},
		"geo": map[string]any{
			"header": s.cfg.GeoIPHeader, "lookup_api_set": s.cfg.GeoIPAPI != "", "regions": s.geo.Regions(),
		},
		"admin": map[string]any{"user": s.cfg.AdminUser, "session_hours": int(adminTTL.Hours())},
	})
}

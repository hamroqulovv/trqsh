package api

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/trqsh-uz/trqsh/internal/api/store"
	"github.com/trqsh-uz/trqsh/internal/platform"
)

// Admin org management: detail, rename, plan, suspension, members, delete.

func (s *Server) handleAdminOrgDetail(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := pathID(r, "id")
	o, err := s.store.GetOrg(ctx, id)
	if err != nil {
		s.adminFail(w, r, err, "org")
		return
	}
	planCode := effectivePlan(o)
	plan := PlanFor(planCode)

	since := time.Now().AddDate(0, 0, -30)
	usage, _ := s.store.UsageForOrg(ctx, id, since)
	series, _ := s.store.UsageSeriesForOrg(ctx, id, since, "day")
	if series == nil {
		series = []store.UsageBucket{}
	}

	members, _ := s.store.ListOrgMembers(ctx, id)
	memberRows := make([]map[string]any, 0, len(members))
	for _, m := range members {
		row := map[string]any{"user_id": m.UserID, "role": m.Role}
		if u, err := s.store.GetUser(ctx, m.UserID); err == nil {
			row["email"], row["name"], row["disabled_at"] = u.Email, u.Name, u.DisabledAt
		}
		memberRows = append(memberRows, row)
	}

	keys, _ := s.store.ListAPIKeys(ctx, id)
	keyRows := make([]map[string]any, 0, len(keys))
	for _, k := range keys {
		keyRows = append(keyRows, map[string]any{
			"id": k.ID, "name": k.Name, "prefix": k.Prefix,
			"last_used_at": k.LastUsedAt, "revoked_at": k.RevokedAt, "created_at": k.CreatedAt,
		})
	}
	subs, _ := s.store.ListSubdomains(ctx, id)
	if subs == nil {
		subs = []store.ReservedSubdomain{}
	}
	domains, _ := s.store.ListCustomDomains(ctx, id)
	if domains == nil {
		domains = []store.CustomDomain{}
	}
	var subscription any
	if sub, err := s.store.GetSubscriptionForOrg(ctx, id); err == nil {
		subscription = sub
	}
	active, _ := s.store.CountTunnelSessions(ctx, id, true)
	totalTunnels, _ := s.store.CountTunnelSessions(ctx, id, false)
	recent, _ := s.store.ListTunnelSessions(ctx, store.TunnelSessionFilter{OrgID: id, Limit: 10})
	if recent == nil {
		recent = []store.TunnelSession{}
	}

	row := adminOrgRow(o)
	row["live_subscription"] = s.liveSubscription(r, id)
	writeJSON(w, http.StatusOK, map[string]any{
		"org": row, "limits": plan, "usage": usage, "usage_series": series,
		"members": memberRows, "api_keys": keyRows, "subdomains": subs, "domains": domains,
		"subscription": subscription,
		"tunnels":      map[string]any{"active": active, "total": totalTunnels, "recent": recent},
		"counts":       map[string]any{"subdomains": len(subs), "domains": len(domains), "api_keys": len(keyRows)},
		"audit":        s.recentAudit(r, "org", id, 15),
	})
}

func (s *Server) handleAdminOrgRename(w http.ResponseWriter, r *http.Request) {
	id := pathID(r, "id")
	var req struct {
		Name string `json:"name"`
	}
	if !decode(w, r, &req) {
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" || len(name) > 120 {
		writeError(w, http.StatusBadRequest, "name must be 1–120 characters")
		return
	}
	before, err := s.store.GetOrg(r.Context(), id)
	if err != nil {
		s.adminFail(w, r, err, "org")
		return
	}
	if err := s.store.RenameOrg(r.Context(), id, name); err != nil {
		s.adminFail(w, r, err, "org")
		return
	}
	s.audit(r, "org.rename", "org", id, "Renamed org", map[string]any{"from": before.Name, "to": name})
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "name": name})
}

// handleAdminOrgPlan sets an org's plan and optional expiry. months=0 means the
// plan never expires; 1–120 expires that many months from now. Setting "free"
// clears the expiry. A live Stripe subscription will overwrite this on its next
// webhook, so the response says so the console can warn.
func (s *Server) handleAdminOrgPlan(w http.ResponseWriter, r *http.Request) {
	id := pathID(r, "id")
	var req struct {
		Plan   string `json:"plan"`
		Months int    `json:"months"`
	}
	if !decode(w, r, &req) {
		return
	}
	plan := strings.ToLower(strings.TrimSpace(req.Plan))
	if _, ok := Catalog[plan]; !ok {
		writeError(w, http.StatusBadRequest, "unknown plan")
		return
	}
	if req.Months < 0 || req.Months > 120 {
		writeError(w, http.StatusBadRequest, "months must be between 0 and 120")
		return
	}
	o, err := s.store.GetOrg(r.Context(), id)
	if err != nil {
		s.adminFail(w, r, err, "org")
		return
	}
	before := effectivePlan(o)
	var expires *time.Time
	if plan != PlanFree && req.Months > 0 {
		t := time.Now().AddDate(0, req.Months, 0)
		expires = &t
	}
	if err := s.store.SetOrgPlan(r.Context(), id, plan, expires); err != nil {
		s.adminFail(w, r, err, "org")
		return
	}
	o.Plan, o.PlanExpiresAt = plan, expires
	s.audit(r, "org.plan", "org", id, "Set plan to "+plan, map[string]any{
		"from": before, "to": plan, "months": req.Months, "expires_at": expires,
	})
	row := adminOrgRow(o)
	row["live_subscription"] = s.liveSubscription(r, id)
	writeJSON(w, http.StatusOK, row)
}

func (s *Server) handleAdminOrgSuspend(w http.ResponseWriter, r *http.Request) {
	id := pathID(r, "id")
	var req struct {
		Reason string `json:"reason"`
	}
	if r.ContentLength != 0 && !decode(w, r, &req) {
		return
	}
	o, err := s.store.GetOrg(r.Context(), id)
	if err != nil {
		s.adminFail(w, r, err, "org")
		return
	}
	now := time.Now()
	reason := cleanReason(req.Reason)
	if err := s.store.SetOrgSuspended(r.Context(), id, &now, reason); err != nil {
		s.adminFail(w, r, err, "org")
		return
	}
	s.audit(r, "org.suspend", "org", id, "Suspended "+o.Name, map[string]any{"reason": reason})
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "suspended_at": now, "suspended_reason": reason})
}

func (s *Server) handleAdminOrgUnsuspend(w http.ResponseWriter, r *http.Request) {
	id := pathID(r, "id")
	o, err := s.store.GetOrg(r.Context(), id)
	if err != nil {
		s.adminFail(w, r, err, "org")
		return
	}
	if err := s.store.SetOrgSuspended(r.Context(), id, nil, ""); err != nil {
		s.adminFail(w, r, err, "org")
		return
	}
	s.audit(r, "org.unsuspend", "org", id, "Reinstated "+o.Name, nil)
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "suspended_at": nil})
}

// handleAdminOrgDelete cascades to the org's keys, domains, subdomains, usage and
// tunnel history. ?confirm= must repeat the org's name, and an org with a live
// subscription is refused.
func (s *Server) handleAdminOrgDelete(w http.ResponseWriter, r *http.Request) {
	id := pathID(r, "id")
	o, err := s.store.GetOrg(r.Context(), id)
	if err != nil {
		s.adminFail(w, r, err, "org")
		return
	}
	if r.URL.Query().Get("confirm") != o.Name {
		writeError(w, http.StatusBadRequest, "confirm must equal the org's name")
		return
	}
	if s.liveSubscription(r, id) {
		writeError(w, http.StatusConflict, "org has a live subscription; cancel it in Stripe first")
		return
	}
	members, _ := s.store.ListOrgMembers(r.Context(), id)
	if err := s.store.DeleteOrg(r.Context(), id); err != nil {
		s.adminFail(w, r, err, "org")
		return
	}
	s.audit(r, "org.delete", "org", id, "Deleted org "+o.Name, map[string]any{"name": o.Name, "plan": o.Plan, "members": len(members)})
	w.WriteHeader(http.StatusNoContent)
}

// --- members ---

func (s *Server) handleAdminMemberAdd(w http.ResponseWriter, r *http.Request) {
	orgID := pathID(r, "id")
	var req struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if !decode(w, r, &req) {
		return
	}
	role, err := validRole(req.Role)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	o, err := s.store.GetOrg(r.Context(), orgID)
	if err != nil {
		s.adminFail(w, r, err, "org")
		return
	}
	u, err := s.store.GetUserByEmail(r.Context(), strings.TrimSpace(req.Email))
	if err != nil {
		writeError(w, http.StatusNotFound, "no account with that email")
		return
	}
	if err := s.store.AddOrgMember(r.Context(), store.OrgMember{OrgID: orgID, UserID: u.ID, Role: role}); err != nil {
		if errors.Is(err, store.ErrConflict) {
			writeError(w, http.StatusConflict, "already a member of this org")
			return
		}
		s.adminFail(w, r, err, "member")
		return
	}
	s.audit(r, "org.member.add", "org", orgID, "Added "+u.Email+" to "+o.Name, map[string]any{"user_id": u.ID, "role": role})
	writeJSON(w, http.StatusCreated, map[string]any{"user_id": u.ID, "email": u.Email, "name": u.Name, "role": role})
}

// lastOwner reports whether userID is the only owner of the org (so removing or
// demoting them would leave the org with nobody who can manage it).
func lastOwner(members []store.OrgMember, userID string) bool {
	owners, isOwner := 0, false
	for _, m := range members {
		if m.Role == "owner" {
			owners++
			if m.UserID == userID {
				isOwner = true
			}
		}
	}
	return isOwner && owners == 1
}

func (s *Server) handleAdminMemberRole(w http.ResponseWriter, r *http.Request) {
	orgID, userID := pathID(r, "id"), pathID(r, "userID")
	var req struct {
		Role string `json:"role"`
	}
	if !decode(w, r, &req) {
		return
	}
	role, err := validRole(req.Role)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	members, _ := s.store.ListOrgMembers(r.Context(), orgID)
	if role != "owner" && lastOwner(members, userID) {
		writeError(w, http.StatusConflict, "this is the only owner; promote someone else first")
		return
	}
	if err := s.store.SetOrgMemberRole(r.Context(), orgID, userID, role); err != nil {
		s.adminFail(w, r, err, "member")
		return
	}
	s.audit(r, "org.member.role", "org", orgID, "Changed a member's role", map[string]any{"user_id": userID, "role": role})
	writeJSON(w, http.StatusOK, map[string]any{"user_id": userID, "role": role})
}

func (s *Server) handleAdminMemberRemove(w http.ResponseWriter, r *http.Request) {
	orgID, userID := pathID(r, "id"), pathID(r, "userID")
	members, _ := s.store.ListOrgMembers(r.Context(), orgID)
	if len(members) <= 1 {
		writeError(w, http.StatusConflict, "this is the last member; delete the org instead")
		return
	}
	if lastOwner(members, userID) {
		writeError(w, http.StatusConflict, "this is the only owner; promote someone else first")
		return
	}
	if err := s.store.RemoveOrgMember(r.Context(), orgID, userID); err != nil {
		s.adminFail(w, r, err, "member")
		return
	}
	s.audit(r, "org.member.remove", "org", orgID, "Removed a member", map[string]any{"user_id": userID})
	w.WriteHeader(http.StatusNoContent)
}

// handleAdminOrgSubdomain reserves a subdomain for an org on an operator's behalf.
// It validates the label and the platform-reserved list like the self-serve path
// but deliberately skips the plan's reservation cap (that is the point of an
// admin grant).
func (s *Server) handleAdminOrgSubdomain(w http.ResponseWriter, r *http.Request) {
	orgID := pathID(r, "id")
	var req struct {
		Subdomain string `json:"subdomain"`
	}
	if !decode(w, r, &req) {
		return
	}
	sub := strings.ToLower(strings.TrimSpace(req.Subdomain))
	if !subdomainRe.MatchString(sub) {
		writeError(w, http.StatusBadRequest, "invalid subdomain")
		return
	}
	if platform.ReservedSubdomain(sub) {
		writeError(w, http.StatusForbidden, "subdomain is reserved for the platform")
		return
	}
	if _, err := s.store.GetOrg(r.Context(), orgID); err != nil {
		s.adminFail(w, r, err, "org")
		return
	}
	res, err := s.store.ReserveSubdomain(r.Context(), store.ReservedSubdomain{OrgID: orgID, Subdomain: sub})
	if errors.Is(err, store.ErrConflict) {
		writeError(w, http.StatusConflict, "subdomain already taken")
		return
	}
	if err != nil {
		s.adminFail(w, r, err, "subdomain")
		return
	}
	s.audit(r, "subdomain.reserve", "org", orgID, "Reserved "+sub+" for the org", map[string]any{"subdomain": sub})
	writeJSON(w, http.StatusCreated, res)
}

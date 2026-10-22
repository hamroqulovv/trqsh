package api

import (
	"errors"
	"net/http"
	"strings"
	"time"
)

// Admin user management: detail, rename, suspend/unsuspend, delete.

// liveSubscription reports whether the org has a Stripe subscription that is still
// billing (so deleting the org or its owner would strand a paying customer).
func (s *Server) liveSubscription(r *http.Request, orgID string) bool {
	sub, err := s.store.GetSubscriptionForOrg(r.Context(), orgID)
	if err != nil {
		return false
	}
	switch sub.Status {
	case "active", "trialing", "past_due", "incomplete":
		return true
	}
	return false
}

func (s *Server) handleAdminUserDetail(w http.ResponseWriter, r *http.Request) {
	id := pathID(r, "id")
	u, err := s.store.GetUser(r.Context(), id)
	if err != nil {
		s.adminFail(w, r, err, "user")
		return
	}
	providers, _ := s.store.ListOAuthProviders(r.Context(), u.ID)
	orgs, _ := s.store.OrgsForUser(r.Context(), u.ID)
	orgRows := make([]map[string]any, 0, len(orgs))
	for _, o := range orgs {
		row := adminOrgRow(o)
		members, _ := s.store.ListOrgMembers(r.Context(), o.ID)
		row["members"] = len(members)
		for _, m := range members {
			if m.UserID == u.ID {
				row["role"] = m.Role
			}
		}
		orgRows = append(orgRows, row)
	}
	if providers == nil {
		providers = []string{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"user": u, "providers": providers, "orgs": orgRows,
		"audit": s.recentAudit(r, "user", u.ID, 15),
	})
}

func (s *Server) handleAdminUserUpdate(w http.ResponseWriter, r *http.Request) {
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
	before, err := s.store.GetUser(r.Context(), id)
	if err != nil {
		s.adminFail(w, r, err, "user")
		return
	}
	if err := s.store.UpdateUserProfile(r.Context(), id, name, ""); err != nil {
		s.adminFail(w, r, err, "user")
		return
	}
	s.audit(r, "user.rename", "user", id, "Renamed "+before.Email, map[string]any{"from": before.Name, "to": name})
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "name": name})
}

func (s *Server) handleAdminUserDisable(w http.ResponseWriter, r *http.Request) {
	id := pathID(r, "id")
	var req struct {
		Reason string `json:"reason"`
	}
	if r.ContentLength != 0 && !decode(w, r, &req) {
		return
	}
	u, err := s.store.GetUser(r.Context(), id)
	if err != nil {
		s.adminFail(w, r, err, "user")
		return
	}
	now := time.Now()
	reason := cleanReason(req.Reason)
	if err := s.store.SetUserDisabled(r.Context(), id, &now, reason); err != nil {
		s.adminFail(w, r, err, "user")
		return
	}
	s.audit(r, "user.disable", "user", id, "Suspended "+u.Email, map[string]any{"reason": reason})
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "disabled_at": now, "disabled_reason": reason})
}

func (s *Server) handleAdminUserEnable(w http.ResponseWriter, r *http.Request) {
	id := pathID(r, "id")
	u, err := s.store.GetUser(r.Context(), id)
	if err != nil {
		s.adminFail(w, r, err, "user")
		return
	}
	if err := s.store.SetUserDisabled(r.Context(), id, nil, ""); err != nil {
		s.adminFail(w, r, err, "user")
		return
	}
	s.audit(r, "user.enable", "user", id, "Reinstated "+u.Email, nil)
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "disabled_at": nil})
}

// handleAdminUserDelete removes the account, and the orgs it alone belongs to. It
// is refused while any of those orgs has a billing subscription, because deleting
// the row would leave Stripe charging a customer that no longer exists.
func (s *Server) handleAdminUserDelete(w http.ResponseWriter, r *http.Request) {
	id := pathID(r, "id")
	u, err := s.store.GetUser(r.Context(), id)
	if err != nil {
		s.adminFail(w, r, err, "user")
		return
	}
	if confirm := r.URL.Query().Get("confirm"); !strings.EqualFold(confirm, u.Email) {
		writeError(w, http.StatusBadRequest, "confirm must equal the user's email")
		return
	}
	orgs, _ := s.store.OrgsForUser(r.Context(), id)
	var removedOrgs []string
	for _, o := range orgs {
		members, _ := s.store.ListOrgMembers(r.Context(), o.ID)
		if len(members) != 1 {
			continue
		}
		if s.liveSubscription(r, o.ID) {
			writeError(w, http.StatusConflict, "org "+o.Name+" has a live subscription; cancel it in Stripe first")
			return
		}
		removedOrgs = append(removedOrgs, o.ID)
	}
	if err := s.store.DeleteUser(r.Context(), id); err != nil {
		s.adminFail(w, r, err, "user")
		return
	}
	s.audit(r, "user.delete", "user", id, "Deleted "+u.Email, map[string]any{"email": u.Email, "name": u.Name, "orgs_removed": removedOrgs})
	w.WriteHeader(http.StatusNoContent)
}

var errBadRole = errors.New("role must be owner, admin or member")

// validRole normalises a membership role.
func validRole(v string) (string, error) {
	switch r := strings.ToLower(strings.TrimSpace(v)); r {
	case "owner", "admin", "member":
		return r, nil
	}
	return "", errBadRole
}

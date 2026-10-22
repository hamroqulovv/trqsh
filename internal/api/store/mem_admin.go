package store

import (
	"context"
	"slices"
	"sort"
	"strings"
	"time"
)

// In-memory implementations of the admin console's store methods.

func (m *MemStore) CountUsers(_ context.Context, search string) (int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	search = strings.ToLower(strings.TrimSpace(search))
	n := 0
	for _, u := range m.users {
		if search == "" || strings.Contains(strings.ToLower(u.Email), search) || strings.Contains(strings.ToLower(u.Name), search) {
			n++
		}
	}
	return n, nil
}

func (m *MemStore) CountTunnelSessionsWhere(_ context.Context, f TunnelSessionFilter) (int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	n := 0
	for _, s := range m.tunnels {
		if tunnelMatches(s, f) {
			n++
		}
	}
	return n, nil
}

func (m *MemStore) SetUserDisabled(_ context.Context, id string, at *time.Time, reason string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.users[id]
	if !ok {
		return ErrNotFound
	}
	u.DisabledAt, u.DisabledReason = at, ""
	if at != nil {
		u.DisabledReason = reason
	}
	m.users[id] = u
	return nil
}

func (m *MemStore) DeleteUser(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.users[id]
	if !ok {
		return ErrNotFound
	}
	// Orgs this user was the only member of go with them.
	var orphaned []string
	seen := map[string]bool{}
	for _, mem := range m.members {
		if mem.UserID == id && !seen[mem.OrgID] {
			seen[mem.OrgID] = true
			if m.memberCount(mem.OrgID) == 1 {
				orphaned = append(orphaned, mem.OrgID)
			}
		}
	}
	for _, orgID := range orphaned {
		m.deleteOrgLocked(orgID)
	}
	m.members = slices.DeleteFunc(m.members, func(e OrgMember) bool { return e.UserID == id })
	m.identities = slices.DeleteFunc(m.identities, func(e oauthIdentity) bool { return e.userID == id })
	delete(m.usersEmail, strings.ToLower(u.Email))
	delete(m.users, id)
	return nil
}

func (m *MemStore) memberCount(orgID string) int {
	n := 0
	for _, e := range m.members {
		if e.OrgID == orgID {
			n++
		}
	}
	return n
}

func (m *MemStore) SetOrgSuspended(_ context.Context, id string, at *time.Time, reason string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	o, ok := m.orgs[id]
	if !ok {
		return ErrNotFound
	}
	o.SuspendedAt, o.SuspendedReason = at, ""
	if at != nil {
		o.SuspendedReason = reason
	}
	m.orgs[id] = o
	return nil
}

func (m *MemStore) RenameOrg(_ context.Context, id, name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	o, ok := m.orgs[id]
	if !ok {
		return ErrNotFound
	}
	o.Name = name
	m.orgs[id] = o
	return nil
}

func (m *MemStore) DeleteOrg(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.orgs[id]; !ok {
		return ErrNotFound
	}
	m.deleteOrgLocked(id)
	return nil
}

// deleteOrgLocked mirrors the schema's ON DELETE CASCADE from orgs.
func (m *MemStore) deleteOrgLocked(id string) {
	m.members = slices.DeleteFunc(m.members, func(e OrgMember) bool { return e.OrgID == id })
	for kid, k := range m.keys {
		if k.OrgID == id {
			delete(m.keyPrefix, k.Prefix)
			delete(m.keys, kid)
		}
	}
	for sid, s := range m.subs {
		if s.OrgID == id {
			delete(m.subByName, s.Subdomain)
			delete(m.subs, sid)
		}
	}
	for did, d := range m.domains {
		if d.OrgID == id {
			delete(m.domByName, d.Domain)
			delete(m.domains, did)
		}
	}
	m.usage = slices.DeleteFunc(m.usage, func(u UsageRecord) bool { return u.OrgID == id })
	m.tunnels = slices.DeleteFunc(m.tunnels, func(t TunnelSession) bool { return t.OrgID == id })
	m.metered = slices.DeleteFunc(m.metered, func(u MeteredUsage) bool { return u.OrgID == id })
	if sub, ok := m.subsByOrg[id]; ok {
		delete(m.subsByStripe, sub.StripeSubID)
		delete(m.subsByOrg, id)
	}
	delete(m.orgs, id)
}

func (m *MemStore) RemoveOrgMember(_ context.Context, orgID, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	before := len(m.members)
	m.members = slices.DeleteFunc(m.members, func(e OrgMember) bool { return e.OrgID == orgID && e.UserID == userID })
	if len(m.members) == before {
		return ErrNotFound
	}
	return nil
}

func (m *MemStore) SetOrgMemberRole(_ context.Context, orgID, userID, role string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i := range m.members {
		if m.members[i].OrgID == orgID && m.members[i].UserID == userID {
			m.members[i].Role = role
			return nil
		}
	}
	return ErrNotFound
}

// --- cross-org directories ---

func (m *MemStore) orgName(id string) string { return m.orgs[id].Name }

func (m *MemStore) ListAllAPIKeys(_ context.Context, q Query, state string) ([]AdminAPIKey, int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	needle := strings.ToLower(strings.TrimSpace(q.Search))
	var all []AdminAPIKey
	for _, k := range m.keys {
		if state == "active" && k.RevokedAt != nil || state == "revoked" && k.RevokedAt == nil {
			continue
		}
		name := m.orgName(k.OrgID)
		if needle != "" && !containsAny(needle, k.Name, k.Prefix, k.OrgID, name) {
			continue
		}
		all = append(all, AdminAPIKey{APIKey: k, OrgName: name})
	}
	sort.Slice(all, func(i, j int) bool { return all[i].CreatedAt.After(all[j].CreatedAt) })
	limit, offset := clampPage(q.Limit, q.Offset)
	return pageSlice(all, limit, offset), len(all), nil
}

func (m *MemStore) AdminRevokeAPIKey(_ context.Context, id string, at time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	k, ok := m.keys[id]
	if !ok {
		return ErrNotFound
	}
	if k.RevokedAt == nil {
		k.RevokedAt = &at
		m.keys[id] = k
	}
	return nil
}

func (m *MemStore) ListAllSubdomains(_ context.Context, q Query) ([]AdminSubdomain, int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	needle := strings.ToLower(strings.TrimSpace(q.Search))
	var all []AdminSubdomain
	for _, s := range m.subs {
		name := m.orgName(s.OrgID)
		if needle != "" && !containsAny(needle, s.Subdomain, s.OrgID, name) {
			continue
		}
		all = append(all, AdminSubdomain{ReservedSubdomain: s, OrgName: name})
	}
	sort.Slice(all, func(i, j int) bool { return all[i].CreatedAt.After(all[j].CreatedAt) })
	limit, offset := clampPage(q.Limit, q.Offset)
	return pageSlice(all, limit, offset), len(all), nil
}

func (m *MemStore) AdminReleaseSubdomain(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.subs[id]
	if !ok {
		return ErrNotFound
	}
	delete(m.subByName, s.Subdomain)
	delete(m.subs, id)
	return nil
}

func (m *MemStore) ListAllCustomDomains(_ context.Context, q Query, status string) ([]AdminDomain, int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	needle := strings.ToLower(strings.TrimSpace(q.Search))
	var all []AdminDomain
	for _, d := range m.domains {
		if status == "verified" && d.VerifiedAt == nil || status == "pending" && d.VerifiedAt != nil {
			continue
		}
		name := m.orgName(d.OrgID)
		if needle != "" && !containsAny(needle, d.Domain, d.OrgID, name) {
			continue
		}
		all = append(all, AdminDomain{CustomDomain: d, OrgName: name})
	}
	sort.Slice(all, func(i, j int) bool { return all[i].CreatedAt.After(all[j].CreatedAt) })
	limit, offset := clampPage(q.Limit, q.Offset)
	return pageSlice(all, limit, offset), len(all), nil
}

func (m *MemStore) AdminVerifyDomain(_ context.Context, id string, at time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	d, ok := m.domains[id]
	if !ok {
		return ErrNotFound
	}
	d.VerifiedAt, d.CertStatus = &at, "verified"
	m.domains[id] = d
	return nil
}

func (m *MemStore) AdminDeleteDomain(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	d, ok := m.domains[id]
	if !ok {
		return ErrNotFound
	}
	delete(m.domByName, d.Domain)
	delete(m.domains, id)
	return nil
}

func (m *MemStore) ListSubscriptions(_ context.Context, q Query, status string) ([]AdminSubscription, int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	needle := strings.ToLower(strings.TrimSpace(q.Search))
	var all []AdminSubscription
	for _, s := range m.subsByOrg {
		if status != "" && s.Status != status {
			continue
		}
		name := m.orgName(s.OrgID)
		if needle != "" && !containsAny(needle, s.OrgID, name, s.StripeSubID, s.StripeCustomerID) {
			continue
		}
		all = append(all, AdminSubscription{Subscription: s, OrgName: name})
	}
	sort.Slice(all, func(i, j int) bool { return all[i].UpdatedAt.After(all[j].UpdatedAt) })
	limit, offset := clampPage(q.Limit, q.Offset)
	return pageSlice(all, limit, offset), len(all), nil
}

func containsAny(needle string, fields ...string) bool {
	for _, f := range fields {
		if strings.Contains(strings.ToLower(f), needle) {
			return true
		}
	}
	return false
}

// --- fleet usage ---

func (m *MemStore) UsageSeriesAll(_ context.Context, since time.Time, bucket string) ([]UsageBucket, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	buckets := map[time.Time]*UsageBucket{}
	for _, u := range m.usage {
		if u.WindowEnd.Before(since) {
			continue
		}
		key := truncateTo(u.WindowEnd, bucket)
		b := buckets[key]
		if b == nil {
			b = &UsageBucket{Start: key}
			buckets[key] = b
		}
		b.BytesIn += u.BytesIn
		b.BytesOut += u.BytesOut
		b.Requests += u.Requests
	}
	out := make([]UsageBucket, 0, len(buckets))
	for _, b := range buckets {
		out = append(out, *b)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Start.Before(out[j].Start) })
	return out, nil
}

func (m *MemStore) TopOrgsByUsage(_ context.Context, since time.Time, limit int) ([]OrgUsage, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	agg := map[string]*OrgUsage{}
	for _, u := range m.usage {
		if u.WindowEnd.Before(since) {
			continue
		}
		a := agg[u.OrgID]
		if a == nil {
			a = &OrgUsage{OrgID: u.OrgID, OrgName: m.orgName(u.OrgID)}
			agg[u.OrgID] = a
		}
		a.BytesIn += u.BytesIn
		a.BytesOut += u.BytesOut
		a.Requests += u.Requests
	}
	out := make([]OrgUsage, 0, len(agg))
	for _, a := range agg {
		out = append(out, *a)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].BytesIn+out[i].BytesOut > out[j].BytesIn+out[j].BytesOut })
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

// --- audit log ---

func (m *MemStore) AppendAudit(_ context.Context, e AuditEntry) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.auditSeq++
	e.ID = m.auditSeq
	if e.At.IsZero() {
		e.At = time.Now()
	}
	m.audit = append(m.audit, e)
	return nil
}

func (m *MemStore) ListAudit(_ context.Context, q AuditQuery) ([]AuditEntry, int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	needle := strings.ToLower(strings.TrimSpace(q.Search))
	var all []AuditEntry
	for i := len(m.audit) - 1; i >= 0; i-- { // newest first
		e := m.audit[i]
		if q.Action != "" && e.Action != q.Action || q.TargetType != "" && e.TargetType != q.TargetType ||
			q.TargetID != "" && e.TargetID != q.TargetID {
			continue
		}
		if needle != "" && !containsAny(needle, e.Action, e.TargetType, e.TargetID, e.Summary, e.Actor) {
			continue
		}
		all = append(all, e)
	}
	limit, offset := clampPage(q.Limit, q.Offset)
	return pageSlice(all, limit, offset), len(all), nil
}

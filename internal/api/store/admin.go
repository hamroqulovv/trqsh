package store

import (
	"strings"
	"time"
)

// Types shared by the admin console's store methods (see Store).

// Query is the paging and free-text window of an admin directory. Limit<=0 falls
// back to a default of 50 and is capped at 200 by the stores.
type Query struct {
	Limit  int
	Offset int
	Search string
}

// AdminAPIKey is an API key with its owning org's name, for the cross-org list.
type AdminAPIKey struct {
	APIKey
	OrgName string `json:"org_name"`
}

// AdminSubdomain is a reservation with its owning org's name.
type AdminSubdomain struct {
	ReservedSubdomain
	OrgName string `json:"org_name"`
}

// AdminDomain is a custom domain with its owning org's name.
type AdminDomain struct {
	CustomDomain
	OrgName string `json:"org_name"`
}

// AdminSubscription is a Stripe subscription mirror with its org's name.
type AdminSubscription struct {
	Subscription
	OrgName string `json:"org_name"`
}

// OrgUsage is one org's traffic over a window, for the "top orgs" ranking.
type OrgUsage struct {
	OrgID    string `json:"org_id"`
	OrgName  string `json:"org_name"`
	BytesIn  int64  `json:"bytes_in"`
	BytesOut int64  `json:"bytes_out"`
	Requests int64  `json:"requests"`
}

// AuditEntry is one row of the append-only admin audit log.
type AuditEntry struct {
	ID         int64          `json:"id"`
	At         time.Time      `json:"at"`
	Actor      string         `json:"actor"`
	Action     string         `json:"action"`
	TargetType string         `json:"target_type"`
	TargetID   string         `json:"target_id"`
	Summary    string         `json:"summary"`
	Detail     map[string]any `json:"detail,omitempty"`
	IP         string         `json:"ip,omitempty"`
}

// AuditQuery filters the audit log. Empty fields match everything; Search is a
// case-insensitive substring over action, target and summary.
type AuditQuery struct {
	Limit      int
	Offset     int
	Action     string
	TargetType string
	TargetID   string
	Search     string
}

const (
	defaultPage = 50
	maxPage     = 200
)

// clampPage normalises a caller-supplied limit/offset.
func clampPage(limit, offset int) (int, int) {
	if limit <= 0 {
		limit = defaultPage
	}
	if limit > maxPage {
		limit = maxPage
	}
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}

// tunnelMatches reports whether a session passes the filter's non-paging fields.
func tunnelMatches(s TunnelSession, f TunnelSessionFilter) bool {
	if f.OrgID != "" && s.OrgID != f.OrgID {
		return false
	}
	if f.ActiveOnly && s.Status != "active" {
		return false
	}
	if f.Type != "" && s.Type != f.Type {
		return false
	}
	if f.Region != "" && s.Region != f.Region {
		return false
	}
	if f.Country != "" && !strings.EqualFold(s.Country, f.Country) {
		return false
	}
	if q := strings.ToLower(strings.TrimSpace(f.Search)); q != "" {
		hay := strings.ToLower(s.PublicURL + " " + s.Host + " " + s.ClientIP + " " + s.OrgID)
		if !strings.Contains(hay, q) {
			return false
		}
	}
	return true
}

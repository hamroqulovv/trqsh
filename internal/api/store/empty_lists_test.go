package store

import (
	"context"
	"testing"
	"time"
)

// TestEmptyListsMem runs the empty-list contract against the in-memory store; the
// same function runs against Postgres from TestPostgresBillingAndUsageRegression
// (opt-in), so both implementations are held to one behaviour.
func TestEmptyListsMem(t *testing.T) { testEmptyLists(t, NewMemStore()) }

// testEmptyLists holds every list method to returning an empty slice, never nil,
// when nothing matches. Handlers encode these results directly, and encoding/json
// writes a nil slice as null, which the dashboard reads as a failed request. It
// writes nothing (an unknown ID matches no rows, like an org with nothing yet),
// so it cannot change what other tests sharing the store count.
func testEmptyLists(t *testing.T, s Store) {
	t.Helper()
	ctx := context.Background()
	const none = "zz-matches-nothing"
	future := time.Now().Add(24 * time.Hour)

	providers, err := s.ListOAuthProviders(ctx, none)
	notNil(t, "ListOAuthProviders", providers, err)
	byPlan, err := s.OrgsByPlan(ctx, none)
	notNil(t, "OrgsByPlan", byPlan, err)
	members, err := s.ListOrgMembers(ctx, none)
	notNil(t, "ListOrgMembers", members, err)
	userOrgs, err := s.OrgsForUser(ctx, none)
	notNil(t, "OrgsForUser", userOrgs, err)
	keys, err := s.ListAPIKeys(ctx, none)
	notNil(t, "ListAPIKeys", keys, err)
	subs, err := s.ListSubdomains(ctx, none)
	notNil(t, "ListSubdomains", subs, err)
	domains, err := s.ListCustomDomains(ctx, none)
	notNil(t, "ListCustomDomains", domains, err)
	orgSeries, err := s.UsageSeriesForOrg(ctx, none, future, "day")
	notNil(t, "UsageSeriesForOrg", orgSeries, err)
	sessions, err := s.ListTunnelSessions(ctx, TunnelSessionFilter{OrgID: none})
	notNil(t, "ListTunnelSessions", sessions, err)
	users, err := s.ListUsers(ctx, 10, 0, none)
	notNil(t, "ListUsers", users, err)
	orgs, err := s.ListOrgs(ctx, 10, 0, "", none)
	notNil(t, "ListOrgs", orgs, err)
	allKeys, _, err := s.ListAllAPIKeys(ctx, Query{Search: none}, "")
	notNil(t, "ListAllAPIKeys", allKeys, err)
	allSubs, _, err := s.ListAllSubdomains(ctx, Query{Search: none})
	notNil(t, "ListAllSubdomains", allSubs, err)
	allDomains, _, err := s.ListAllCustomDomains(ctx, Query{Search: none}, "")
	notNil(t, "ListAllCustomDomains", allDomains, err)
	subscriptions, _, err := s.ListSubscriptions(ctx, Query{Search: none}, "")
	notNil(t, "ListSubscriptions", subscriptions, err)
	allSeries, err := s.UsageSeriesAll(ctx, future, "day")
	notNil(t, "UsageSeriesAll", allSeries, err)
	top, err := s.TopOrgsByUsage(ctx, future, 10)
	notNil(t, "TopOrgsByUsage", top, err)
	audit, _, err := s.ListAudit(ctx, AuditQuery{TargetID: none})
	notNil(t, "ListAudit", audit, err)
	pending, err := s.PendingMeteredUsage(ctx, 10)
	notNil(t, "PendingMeteredUsage", pending, err)
}

func notNil[T any](t *testing.T, method string, got []T, err error) {
	t.Helper()
	if err != nil {
		t.Errorf("%s: %v", method, err)
	} else if got == nil {
		t.Errorf("%s returned nil, want an empty slice", method)
	}
}

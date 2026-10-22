package store

import (
	"context"
	"testing"
	"time"
)

// TestAdminControlsMem runs the admin contract against the in-memory store; the
// same function runs against Postgres from TestPostgresBillingAndUsageRegression
// (opt-in), so both implementations are held to one behaviour.
func TestAdminControlsMem(t *testing.T) { testAdminControls(t, NewMemStore()) }

func testAdminControls(t *testing.T, s Store) {
	t.Helper()
	ctx := context.Background()
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	user := func(email, name string) User {
		u, err := s.CreateUser(ctx, User{Email: email, Name: name})
		must(err)
		return u
	}
	org := func(name, plan string, owner User) Org {
		o, err := s.CreateOrg(ctx, Org{Name: name, Plan: plan})
		must(err)
		must(s.AddOrgMember(ctx, OrgMember{OrgID: o.ID, UserID: owner.ID, Role: "owner"}))
		return o
	}
	ann, bob, cy := user("ann@admin.test", "Ann"), user("bob@admin.test", "100%_Bob"), user("cy@admin.test", "Cy")
	annOrg, bobOrg := org("Ann Co", "pro", ann), org("Bob Co", "free", bob)
	cyOrg := org("Cy Co", "team", cy)

	// Suspension round-trips through every read path.
	now := time.Now()
	must(s.SetUserDisabled(ctx, ann.ID, &now, "spam"))
	if u, _ := s.GetUser(ctx, ann.ID); u.DisabledAt == nil || u.DisabledReason != "spam" {
		t.Fatalf("disabled user = %+v", u)
	}
	if u, _ := s.GetUserByEmail(ctx, "ann@admin.test"); u.DisabledAt == nil {
		t.Fatal("GetUserByEmail lost the disabled flag")
	}
	must(s.SetUserDisabled(ctx, ann.ID, nil, ""))
	if u, _ := s.GetUser(ctx, ann.ID); u.DisabledAt != nil || u.DisabledReason != "" {
		t.Fatalf("re-enabled user = %+v", u)
	}
	must(s.SetOrgSuspended(ctx, annOrg.ID, &now, "chargeback"))
	if o, _ := s.GetOrg(ctx, annOrg.ID); o.SuspendedAt == nil || o.SuspendedReason != "chargeback" {
		t.Fatalf("suspended org = %+v", o)
	}
	if orgs, _ := s.OrgsForUser(ctx, ann.ID); len(orgs) != 1 || orgs[0].SuspendedAt == nil {
		t.Fatalf("OrgsForUser lost the suspension: %+v", orgs)
	}
	must(s.SetOrgSuspended(ctx, annOrg.ID, nil, ""))
	must(s.RenameOrg(ctx, annOrg.ID, "Ann Inc"))
	for _, err := range []error{s.SetUserDisabled(ctx, "nope", &now, ""), s.SetOrgSuspended(ctx, "nope", &now, ""), s.RenameOrg(ctx, "nope", "x")} {
		if err != ErrNotFound {
			t.Fatalf("unknown id error = %v, want ErrNotFound", err)
		}
	}

	// Directories: search is literal (a "%" or "_" matches itself), totals agree.
	if got, _ := s.ListUsers(ctx, 10, 0, "100%_"); len(got) != 1 || got[0].ID != bob.ID {
		t.Fatalf("literal search = %+v", got)
	}
	if n, _ := s.CountUsers(ctx, "admin.test"); n != 3 {
		t.Fatalf("CountUsers = %d, want 3", n)
	}
	// "%" is a literal here: only Bob's name contains one, so it must not match all 3.
	if n, _ := s.CountUsers(ctx, "%"); n != 1 {
		t.Fatalf("a bare %% must match only literal percent signs, got %d", n)
	}
	if got, _ := s.ListOrgs(ctx, 10, 0, "", "ann"); len(got) != 1 || got[0].Name != "Ann Inc" {
		t.Fatalf("org search = %+v", got)
	}
	if n, _ := s.CountOrgs(ctx, "free", ""); n != 1 {
		t.Fatalf("CountOrgs(free) = %d", n)
	}

	// Members.
	must(s.AddOrgMember(ctx, OrgMember{OrgID: annOrg.ID, UserID: bob.ID, Role: "member"}))
	must(s.SetOrgMemberRole(ctx, annOrg.ID, bob.ID, "admin"))
	if ms, _ := s.ListOrgMembers(ctx, annOrg.ID); len(ms) != 2 {
		t.Fatalf("members = %+v", ms)
	}
	must(s.RemoveOrgMember(ctx, annOrg.ID, bob.ID))
	if s.RemoveOrgMember(ctx, annOrg.ID, bob.ID) != ErrNotFound || s.SetOrgMemberRole(ctx, annOrg.ID, bob.ID, "x") != ErrNotFound {
		t.Fatal("removing/promoting a non-member must be ErrNotFound")
	}

	// Cross-org resources.
	k1, err := s.CreateAPIKey(ctx, APIKey{OrgID: annOrg.ID, Name: "laptop", Prefix: "tq_live_aaaa1111", Hash: "h1"})
	must(err)
	_, err = s.CreateAPIKey(ctx, APIKey{OrgID: bobOrg.ID, Name: "ci", Prefix: "tq_live_bbbb2222", Hash: "h2"})
	must(err)
	if ks, total, _ := s.ListAllAPIKeys(ctx, Query{Search: "ann"}, ""); total != 1 || len(ks) != 1 || ks[0].OrgName != "Ann Inc" {
		t.Fatalf("keys by org name = %+v (%d)", ks, total)
	}
	must(s.AdminRevokeAPIKey(ctx, k1.ID, now))
	must(s.AdminRevokeAPIKey(ctx, k1.ID, now.Add(time.Hour))) // idempotent
	if _, total, _ := s.ListAllAPIKeys(ctx, Query{}, "revoked"); total != 1 {
		t.Fatalf("revoked keys = %d, want 1", total)
	}
	if _, total, _ := s.ListAllAPIKeys(ctx, Query{}, "active"); total != 1 {
		t.Fatalf("active keys = %d, want 1", total)
	}
	if got, _ := s.GetAPIKeyByPrefix(ctx, "tq_live_aaaa1111"); got.RevokedAt == nil || got.RevokedAt.After(now.Add(time.Minute)) {
		t.Fatalf("revoking twice must keep the first revocation time: %+v", got.RevokedAt)
	}
	if s.AdminRevokeAPIKey(ctx, "nope", now) != ErrNotFound {
		t.Fatal("unknown key must be ErrNotFound")
	}

	sub, err := s.ReserveSubdomain(ctx, ReservedSubdomain{OrgID: bobOrg.ID, Subdomain: "bobsite"})
	must(err)
	if subs, total, _ := s.ListAllSubdomains(ctx, Query{Search: "bobs"}); total != 1 || subs[0].OrgName != "Bob Co" {
		t.Fatalf("subdomains = %+v", subs)
	}
	must(s.AdminReleaseSubdomain(ctx, sub.ID))
	if s.AdminReleaseSubdomain(ctx, sub.ID) != ErrNotFound {
		t.Fatal("second release must be ErrNotFound")
	}

	d, err := s.AddCustomDomain(ctx, CustomDomain{OrgID: cyOrg.ID, Domain: "cy.example.org", VerifyToken: "t"})
	must(err)
	if _, total, _ := s.ListAllCustomDomains(ctx, Query{}, "pending"); total != 1 {
		t.Fatalf("pending domains = %d", total)
	}
	must(s.AdminVerifyDomain(ctx, d.ID, now))
	if doms, total, _ := s.ListAllCustomDomains(ctx, Query{}, "verified"); total != 1 || doms[0].VerifiedAt == nil || doms[0].CertStatus != "verified" {
		t.Fatalf("verified domains = %+v", doms)
	}
	must(s.AdminDeleteDomain(ctx, d.ID))
	if s.AdminDeleteDomain(ctx, d.ID) != ErrNotFound {
		t.Fatal("second delete must be ErrNotFound")
	}

	// Subscriptions, usage, tunnels.
	_, err = s.UpsertSubscription(ctx, Subscription{OrgID: cyOrg.ID, StripeSubID: "sub_cy", StripeCustomerID: "cus_cy", Plan: "team", Status: "past_due"})
	must(err)
	if subs, total, _ := s.ListSubscriptions(ctx, Query{Search: "cy co"}, "past_due"); total != 1 || subs[0].OrgName != "Cy Co" {
		t.Fatalf("subscriptions = %+v", subs)
	}
	if _, total, _ := s.ListSubscriptions(ctx, Query{}, "active"); total != 0 {
		t.Fatalf("status filter ignored: %d", total)
	}

	must(s.UpsertUsage(ctx, UsageRecord{EventID: "e1", OrgID: annOrg.ID, BytesIn: 10, BytesOut: 30, Requests: 4, WindowStart: now.Add(-time.Hour), WindowEnd: now}))
	must(s.UpsertUsage(ctx, UsageRecord{EventID: "e2", OrgID: bobOrg.ID, BytesIn: 100, BytesOut: 300, Requests: 9, WindowStart: now.Add(-time.Hour), WindowEnd: now}))
	series, err := s.UsageSeriesAll(ctx, now.Add(-48*time.Hour), "day")
	must(err)
	if len(series) != 1 || series[0].BytesIn != 110 || series[0].Requests != 13 {
		t.Fatalf("fleet series = %+v", series)
	}
	top, err := s.TopOrgsByUsage(ctx, now.Add(-48*time.Hour), 5)
	must(err)
	if len(top) != 2 || top[0].OrgID != bobOrg.ID || top[0].OrgName != "Bob Co" || top[0].BytesOut != 300 {
		t.Fatalf("top orgs = %+v", top)
	}

	for i, ty := range []string{"http", "tcp"} {
		_, err = s.RecordTunnelOpen(ctx, TunnelSession{OrgID: annOrg.ID, EdgeID: "e", SessionID: "s", TunnelID: string(rune('a' + i)), Type: ty,
			PublicURL: "https://" + ty + "-demo.example.org", Region: "eu", Country: "UZ", ClientIP: "203.0.113.9"})
		must(err)
	}
	f := TunnelSessionFilter{Type: "tcp", Country: "uz", Search: "DEMO", Region: "eu", ActiveOnly: true, Limit: 10}
	if got, _ := s.ListTunnelSessions(ctx, f); len(got) != 1 || got[0].Type != "tcp" {
		t.Fatalf("filtered tunnels = %+v", got)
	}
	if n, _ := s.CountTunnelSessionsWhere(ctx, f); n != 1 {
		t.Fatalf("CountTunnelSessionsWhere = %d", n)
	}
	if n, _ := s.CountTunnelSessionsWhere(ctx, TunnelSessionFilter{Search: "203.0.113"}); n != 2 {
		t.Fatalf("search by agent IP = %d, want 2", n)
	}

	// Audit log: newest first, filterable, details survive the round trip.
	must(s.AppendAudit(ctx, AuditEntry{Actor: "root", Action: "org.plan", TargetType: "org", TargetID: annOrg.ID, Summary: "Set plan to pro", Detail: map[string]any{"from": "free"}, IP: "10.0.0.1"}))
	must(s.AppendAudit(ctx, AuditEntry{Actor: "root", Action: "user.disable", TargetType: "user", TargetID: ann.ID, Summary: "Suspended ann"}))
	all, total, err := s.ListAudit(ctx, AuditQuery{})
	must(err)
	if total != 2 || all[0].Action != "user.disable" || all[1].Detail["from"] != "free" || all[1].IP != "10.0.0.1" {
		t.Fatalf("audit = %+v (%d)", all, total)
	}
	if got, total, _ := s.ListAudit(ctx, AuditQuery{TargetType: "org", TargetID: annOrg.ID}); total != 1 || got[0].Action != "org.plan" {
		t.Fatalf("audit by target = %+v", got)
	}
	if _, total, _ := s.ListAudit(ctx, AuditQuery{Search: "SUSPENDED"}); total != 1 {
		t.Fatalf("audit search = %d", total)
	}

	// Deleting a user removes the orgs only they belonged to, with their data.
	must(s.DeleteUser(ctx, bob.ID))
	if _, err := s.GetUser(ctx, bob.ID); err != ErrNotFound {
		t.Fatalf("deleted user still readable: %v", err)
	}
	if _, err := s.GetOrg(ctx, bobOrg.ID); err != ErrNotFound {
		t.Fatalf("sole-member org survived its owner: %v", err)
	}
	if _, total, _ := s.ListAllAPIKeys(ctx, Query{Search: "ci"}, ""); total != 0 {
		t.Fatal("the deleted org's key survived")
	}
	if u, _ := s.UsageForOrg(ctx, bobOrg.ID, now.Add(-48*time.Hour)); u.BytesIn != 0 {
		t.Fatalf("the deleted org's usage survived: %+v", u)
	}
	if _, err := s.GetOrg(ctx, annOrg.ID); err != nil {
		t.Fatalf("an unrelated org was deleted: %v", err)
	}
	if s.DeleteUser(ctx, bob.ID) != ErrNotFound {
		t.Fatal("deleting a deleted user must be ErrNotFound")
	}

	// A shared org survives the removal of one member's account.
	must(s.AddOrgMember(ctx, OrgMember{OrgID: annOrg.ID, UserID: cy.ID, Role: "member"}))
	must(s.DeleteUser(ctx, cy.ID))
	if _, err := s.GetOrg(ctx, annOrg.ID); err != nil {
		t.Fatalf("shared org deleted with one member: %v", err)
	}
	if _, err := s.GetOrg(ctx, cyOrg.ID); err != ErrNotFound {
		t.Fatalf("Cy's own org should be gone: %v", err)
	}
	if _, err := s.GetSubscriptionForOrg(ctx, cyOrg.ID); err != ErrNotFound {
		t.Fatalf("subscription survived its org: %v", err)
	}

	// DeleteOrg cascades to everything hanging off it.
	must(s.DeleteOrg(ctx, annOrg.ID))
	if n, _ := s.CountTunnelSessionsWhere(ctx, TunnelSessionFilter{OrgID: annOrg.ID}); n != 0 {
		t.Fatalf("tunnel history survived the org: %d", n)
	}
	if s.DeleteOrg(ctx, annOrg.ID) != ErrNotFound {
		t.Fatal("deleting a deleted org must be ErrNotFound")
	}
}

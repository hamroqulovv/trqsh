package store

import (
	"context"
	"testing"
	"time"
)

// TestCloseAbsentTunnelSessionsMem runs the tunnel-sync contract against the
// in-memory store; the same function runs against Postgres from
// TestPostgresBillingAndUsageRegression (opt-in).
func TestCloseAbsentTunnelSessionsMem(t *testing.T) {
	testCloseAbsentTunnelSessions(t, NewMemStore())
}

// testCloseAbsentTunnelSessions holds an edge's tunnel sync to closing exactly
// the rows that edge no longer serves: not live ones, not ones bound after the
// snapshot, not another edge's, and not ones already closed.
func testCloseAbsentTunnelSessions(t *testing.T, s Store) {
	t.Helper()
	ctx := context.Background()
	org, err := s.CreateOrg(ctx, Org{Name: "Sync Co", Plan: "free"})
	if err != nil {
		t.Fatal(err)
	}
	at := time.Now().UTC().Truncate(time.Second)
	open := func(edge, session, tunnel string, started time.Time) {
		t.Helper()
		if _, err := s.RecordTunnelOpen(ctx, TunnelSession{
			OrgID: org.ID, EdgeID: edge, SessionID: session, TunnelID: tunnel, Type: "http", StartedAt: started,
		}); err != nil {
			t.Fatal(err)
		}
	}
	open("edge-a", "s1", "live", at.Add(-time.Hour))   // still served
	open("edge-a", "s1", "gone", at.Add(-time.Hour))   // dropped: close it
	open("edge-a", "s2", "gone", at.Add(-2*time.Hour)) // its whole session is gone: close it
	open("edge-a", "s3", "new", at.Add(time.Second))   // bound after the snapshot: keep
	open("edge-b", "s1", "gone", at.Add(-time.Hour))   // another edge's: keep
	open("edge-a", "s4", "done", at.Add(-time.Hour))
	ended := at.Add(-30 * time.Minute)
	if err := s.CloseTunnelSession(ctx, "edge-a", "s4", "done", ended, 10, 20, 3); err != nil {
		t.Fatal(err)
	}

	live := []TunnelKey{{SessionID: "s1", TunnelID: "live"}}
	if n, err := s.CloseAbsentTunnelSessions(ctx, "edge-a", live, at); err != nil || n != 2 {
		t.Fatalf("CloseAbsentTunnelSessions = %d, %v; want 2 closed", n, err)
	}
	sessions, err := s.ListTunnelSessions(ctx, TunnelSessionFilter{OrgID: org.ID})
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"edge-a/s1/live": "active", "edge-a/s1/gone": "closed", "edge-a/s2/gone": "closed",
		"edge-a/s3/new": "active", "edge-b/s1/gone": "active", "edge-a/s4/done": "closed",
	}
	if len(sessions) != len(want) {
		t.Fatalf("listed %d sessions, want %d: %+v", len(sessions), len(want), sessions)
	}
	for _, ts := range sessions {
		key := ts.EdgeID + "/" + ts.SessionID + "/" + ts.TunnelID
		if ts.Status != want[key] {
			t.Errorf("%s: status %q, want %q", key, ts.Status, want[key])
		}
		switch key {
		case "edge-a/s1/gone", "edge-a/s2/gone":
			if ts.EndedAt == nil || !ts.EndedAt.Equal(at) {
				t.Errorf("%s: ended_at %v, want the sync time %v", key, ts.EndedAt, at)
			}
		case "edge-a/s4/done":
			if ts.EndedAt == nil || !ts.EndedAt.Equal(ended) || ts.BytesIn != 10 {
				t.Errorf("%s: an already closed row changed: %+v", key, ts)
			}
		}
	}
	// Nothing is left to close, so the next sync is a no-op.
	if n, err := s.CloseAbsentTunnelSessions(ctx, "edge-a", live, at); err != nil || n != 0 {
		t.Fatalf("repeat sync closed %d (%v), want 0", n, err)
	}
}

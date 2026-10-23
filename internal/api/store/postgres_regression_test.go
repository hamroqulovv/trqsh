package store

import (
	"context"
	"database/sql"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// This test creates its own schema and never reads application data. It is
// opt-in: set TRQSH_TEST_DATABASE_URL to an isolated, disposable Postgres DB.
func TestPostgresBillingAndUsageRegression(t *testing.T) {
	dsn := os.Getenv("TRQSH_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TRQSH_TEST_DATABASE_URL not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	admin, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = admin.Close() }()
	schema := NewID("fix_test")
	if _, err := admin.ExecContext(ctx, `CREATE SCHEMA `+schema); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = admin.ExecContext(context.Background(), `DROP SCHEMA `+schema+` CASCADE`) }()
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	p, err := NewPostgresStore(u.String(), PoolConfig{})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = p.Close() }()
	files, err := filepath.Glob("../db/migrations/*.sql")
	if err != nil || len(files) == 0 {
		t.Fatalf("migrations: %v", err)
	}
	for _, path := range files {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		up := strings.SplitN(string(data), "-- +goose Down", 2)[0]
		if _, err := p.db.ExecContext(ctx, up); err != nil {
			t.Fatalf("%s: %v", path, err)
		}
	}
	// First, while the schema is still empty, so unfiltered lists are empty too.
	t.Run("Empty lists", func(t *testing.T) { testEmptyLists(t, p) })
	t.Run("OAuth identity persistence", func(t *testing.T) { testOAuthSubjectPersistence(t, p) })
	t.Run("Admin controls", func(t *testing.T) { testAdminControls(t, p) })
	t.Run("Tunnel sync", func(t *testing.T) { testCloseAbsentTunnelSessions(t, p) })
	org, err := p.CreateOrg(ctx, Org{Name: "regression", Plan: "free"})
	if err != nil {
		t.Fatal(err)
	}
	rollback := errors.New("injected write failure")
	err = p.BillingTransaction(ctx, func(tx Store) error {
		if first, err := tx.MarkEventProcessed(ctx, "retry-event", "test"); err != nil || !first {
			t.Fatalf("dedupe: %v", err)
		}
		if _, err := tx.UpsertSubscription(ctx, Subscription{OrgID: org.ID, StripeSubID: "sub_test", Plan: "pro", Status: "active"}); err != nil {
			return err
		}
		if err := tx.UpdateOrgPlan(ctx, org.ID, "pro"); err != nil {
			return err
		}
		return rollback
	})
	if !errors.Is(err, rollback) {
		t.Fatalf("rollback: %v", err)
	}
	if got, _ := p.GetOrg(ctx, org.ID); got.Plan != "free" {
		t.Fatal("rolled-back plan persisted")
	}
	if _, err := p.GetSubscriptionForOrg(ctx, org.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("rolled-back subscription persisted: %v", err)
	}
	err = p.BillingTransaction(ctx, func(tx Store) error {
		first, err := tx.MarkEventProcessed(ctx, "retry-event", "test")
		if err != nil {
			return err
		}
		if !first {
			return errors.New("failed event was permanently deduped")
		}
		return tx.UpdateOrgPlan(ctx, org.ID, "pro")
	})
	if err != nil {
		t.Fatal(err)
	}
	if got, _ := p.GetOrg(ctx, org.ID); got.Plan != "pro" {
		t.Fatal("retry did not commit")
	}
	start := time.Now().UTC().Truncate(time.Second)
	end := start.Add(time.Hour)
	usage := UsageRecord{EventID: "stable-batch", OrgID: org.ID, BytesIn: 100, WindowStart: start, WindowEnd: end}
	for range 2 {
		if err := p.UpsertUsage(ctx, usage); err != nil {
			t.Fatal(err)
		}
	}
	later := usage
	later.EventID = "future-batch"
	later.BytesIn = 200
	later.WindowEnd = end.Add(time.Hour)
	if err := p.UpsertUsage(ctx, later); err != nil {
		t.Fatal(err)
	}
	agg, err := p.UsageForOrgWindow(ctx, org.ID, start, end)
	if err != nil || agg.BytesIn != 100 {
		t.Fatalf("deduped bounded usage: %+v, %v", agg, err)
	}
	for _, metric := range []string{"bandwidth_bytes", "requests"} {
		if _, err := p.InsertMeteredUsage(ctx, MeteredUsage{OrgID: org.ID, Metric: metric, Quantity: 100, WindowStart: start, WindowEnd: end}); err != nil {
			t.Fatal(err)
		}
		qty, last, err := p.MeteredForWindow(ctx, org.ID, metric, start, end.Add(time.Hour))
		if err != nil || qty != 100 || !last.Equal(end) {
			t.Fatalf("meter checkpoint: %d %s %v", qty, last, err)
		}
	}
}

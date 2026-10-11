package billing

import (
	"context"
	"errors"
	"github.com/trqsh-uz/trqsh/internal/api/store"
	"sync"
	"testing"
	"time"
)

type auditFailOnceStore struct {
	store.Store
	fail bool
}

func (s *auditFailOnceStore) UpdateOrgPlan(ctx context.Context, id, plan string) error {
	if s.fail {
		s.fail = false
		return errors.New("temporary database failure")
	}
	return s.Store.UpdateOrgPlan(ctx, id, plan)
}
func (s *auditFailOnceStore) BillingTransaction(ctx context.Context, fn func(store.Store) error) error {
	return s.Store.BillingTransaction(ctx, func(tx store.Store) error {
		injected := &auditFailOnceStore{Store: tx, fail: s.fail}
		err := fn(injected)
		s.fail = injected.fail
		return err
	})
}
func TestAuditWebhookRetryAfterFailure(t *testing.T) {
	s, st, _ := testService(t)
	org := newOrg(t, st, PlanFree)
	s.store = &auditFailOnceStore{Store: st, fail: true}
	body := subEvent("evt_audit", "customer.subscription.created", org.ID, "cus_audit", "price_pro_m", "active")
	first := postWebhook(t, s, "whsec_test", body)
	second := postWebhook(t, s, "whsec_test", body)
	if first.Code != 500 {
		t.Fatalf("failure injection did not work: %d", first.Code)
	}
	if plan := orgPlan(t, st, org.ID); plan != PlanPro {
		t.Errorf("retry status=%d body=%s; org remains %s after transient failure", second.Code, second.Body, plan)
	}
}
func TestAuditMeteringSubsequentUsage(t *testing.T) {
	s, st, fs := testService(t)
	org := newOrg(t, st, PlanPAYG)
	ctx := context.Background()
	_ = st.SetOrgStripeCustomer(ctx, org.ID, "cus_audit")
	start := monthStart(time.Now())
	end := start.Add(time.Hour)
	_ = st.UpsertUsage(ctx, store.UsageRecord{OrgID: org.ID, BytesIn: 100, WindowStart: start, WindowEnd: end})
	_, _ = s.CollectMeteredUsage(ctx, start, end)
	_, _ = s.FlushMeteredUsage(ctx)
	_ = st.UpsertUsage(ctx, store.UsageRecord{OrgID: org.ID, BytesIn: 200, WindowStart: end, WindowEnd: end.Add(time.Hour)})
	_, _ = s.CollectMeteredUsage(ctx, start, end.Add(time.Hour))
	_, _ = s.FlushMeteredUsage(ctx)
	var total int64
	for _, e := range fs.meterEvents {
		if e.EventName == "trqsh_bandwidth" {
			total += e.Value
		}
	}
	if total != 300 {
		t.Errorf("metered bandwidth=%d, want 300; new usage after first collection was lost", total)
	}
}
func TestAuditMeteringHonorsWindowEnd(t *testing.T) {
	s, st, _ := testService(t)
	org := newOrg(t, st, PlanPAYG)
	ctx := context.Background()
	start := monthStart(time.Now())
	end := start.Add(time.Hour)
	_ = st.UpsertUsage(ctx, store.UsageRecord{OrgID: org.ID, BytesIn: 100, WindowStart: start, WindowEnd: end.Add(-time.Second)})
	_ = st.UpsertUsage(ctx, store.UsageRecord{OrgID: org.ID, BytesIn: 200, WindowStart: end, WindowEnd: end.Add(time.Hour)})
	_, _ = s.CollectMeteredUsage(ctx, start, end)
	rows, _ := st.PendingMeteredUsage(ctx, 100)
	for _, r := range rows {
		if r.Metric == MetricBandwidth && r.Quantity != 100 {
			t.Errorf("window collected %d bytes, want 100; includes later window", r.Quantity)
		}
	}
}

func TestMeteringLateUsageAndConcurrentCollection(t *testing.T) {
	s, st, _ := testService(t)
	org := newOrg(t, st, PlanPAYG)
	ctx := context.Background()
	start := monthStart(time.Now())
	end := start.Add(time.Hour)
	if err := st.UpsertUsage(ctx, store.UsageRecord{OrgID: org.ID, EventID: "first", BytesIn: 100, WindowEnd: end}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CollectMeteredUsage(ctx, start, end); err != nil {
		t.Fatal(err)
	}
	// A delayed edge report for an already closed period must produce a new
	// delta, without changing the identifier/quantity of the first push.
	if err := st.UpsertUsage(ctx, store.UsageRecord{OrgID: org.ID, EventID: "late", BytesIn: 100, WindowEnd: end}); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	for range 10 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.CollectMeteredUsage(ctx, start, end); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	rows, err := st.PendingMeteredUsage(ctx, 100)
	if err != nil {
		t.Fatal(err)
	}
	var total int64
	ids := map[string]bool{}
	for _, row := range rows {
		if row.Metric == MetricBandwidth {
			total += row.Quantity
			id := meterIdentifier(row)
			if ids[id] {
				t.Fatal("Stripe delta identifier reused")
			}
			ids[id] = true
		}
	}
	if total != 200 || len(ids) != 2 {
		t.Fatalf("queued %d bytes in %d deltas", total, len(ids))
	}
}

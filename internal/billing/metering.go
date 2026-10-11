package billing

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/trqsh-uz/trqsh/internal/api/store"
	"github.com/trqsh-uz/trqsh/internal/billing/stripe"
)

// CollectMeteredUsage rolls usage_records up into metered_usage push rows for
// every Pay-as-you-go org, including usage windows ending in (start, end].
// It subtracts previously queued quantities transactionally, so repeated and
// growing windows push only new usage, including records reported late.
// Returns the number of push rows created.
//
// Run this once per billing period close (e.g. daily/at month end) from a
// scheduler; usage itself flows in continuously via ReportUsage.
func (s *Service) CollectMeteredUsage(ctx context.Context, start, end time.Time) (int, error) {
	if !end.After(start) {
		return 0, errors.New("invalid metering window")
	}
	orgs, err := s.store.OrgsByPlan(ctx, PlanPAYG)
	if err != nil {
		return 0, err
	}
	created := 0
	var collectErrors []error
	for _, org := range orgs {
		n, err := s.collectForOrg(ctx, org.ID, start, end)
		if err != nil {
			s.log.Error("metering: collect", "org", org.ID, "err", err)
			collectErrors = append(collectErrors, err)
			continue
		}
		created += n
	}
	return created, errors.Join(collectErrors...)
}

func (s *Service) collectForOrg(ctx context.Context, orgID string, start, end time.Time) (int, error) {
	created := 0
	err := s.store.BillingTransaction(ctx, func(tx store.Store) error {
		usage, err := tx.UsageForOrgWindow(ctx, orgID, start, end)
		if err != nil {
			return err
		}
		for _, m := range []struct {
			metric string
			qty    int64
		}{
			{MetricBandwidth, usage.BytesIn + usage.BytesOut},
			{MetricRequests, usage.Requests},
		} {
			if m.qty <= 0 {
				continue
			}
			previous, _, err := tx.MeteredForWindow(ctx, orgID, m.metric, start, end)
			if err != nil {
				return err
			}
			delta := m.qty - previous
			if delta <= 0 {
				continue
			}
			_, err = tx.InsertMeteredUsage(ctx, store.MeteredUsage{
				OrgID: orgID, Metric: m.metric, Quantity: delta, WindowStart: start, WindowEnd: end,
			})
			if err != nil {
				return err
			}
			created++
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return created, nil
}

// FlushMeteredUsage pushes pending metered_usage rows to Stripe via the Billing
// Meters API and marks them reported. The row's stable identifier doubles as the
// Stripe idempotency key, so a retry after a partial failure never double-counts.
// Returns the number of rows successfully reported.
func (s *Service) FlushMeteredUsage(ctx context.Context) (int, error) {
	if !s.cfg.Enabled() || s.stripe == nil {
		return 0, ErrBillingDisabled
	}
	pending, err := s.store.PendingMeteredUsage(ctx, 500)
	if err != nil {
		return 0, err
	}
	var reported []int64
	for _, u := range pending {
		eventName := s.cfg.MeterEventName(u.Metric)
		if eventName == "" {
			continue // metric not wired to a Stripe meter; leave pending
		}
		org, err := s.store.GetOrg(ctx, u.OrgID)
		if err != nil || org.StripeCustomerID == "" {
			continue
		}
		if err := s.stripe.CreateMeterEvent(ctx, stripe.MeterEventParams{
			EventName:  eventName,
			CustomerID: org.StripeCustomerID,
			Value:      u.Quantity,
			Identifier: meterIdentifier(u),
			Timestamp:  u.WindowEnd,
		}); err != nil {
			s.log.Error("metering: push", "org", u.OrgID, "metric", u.Metric, "err", err)
			continue
		}
		reported = append(reported, u.ID)
	}
	if len(reported) > 0 {
		if err := s.store.MarkMeteredUsageReported(ctx, reported, time.Now()); err != nil {
			return len(reported), err
		}
	}
	return len(reported), nil
}

// meterIdentifier preserves legacy keys and gives each new delta its own key.
func meterIdentifier(u store.MeteredUsage) string {
	if u.Identifier != "" {
		return u.Identifier
	}
	return fmt.Sprintf("mu_%s_%s_%d", u.OrgID, u.Metric, u.ID)
}

// RunMeteringLoop periodically collects the current period's metered usage and
// flushes it to Stripe until ctx is canceled. Start it from the API server when
// billing is enabled and an interval is configured.
func (s *Service) RunMeteringLoop(ctx context.Context, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-t.C:
			current := monthStart(now)
			if _, err := s.CollectMeteredUsage(ctx, current.AddDate(0, -1, 0), current); err != nil {
				s.log.Error("metering: previous period collect", "err", err)
			}
			if _, err := s.CollectMeteredUsage(ctx, monthStart(now), now); err != nil {
				s.log.Error("metering: periodic collect", "err", err)
			}
			if n, err := s.FlushMeteredUsage(ctx); err != nil && !errors.Is(err, ErrBillingDisabled) {
				s.log.Error("metering: periodic flush", "err", err)
			} else if n > 0 {
				s.log.Info("metering: flushed usage to Stripe", "rows", n)
			}
		}
	}
}

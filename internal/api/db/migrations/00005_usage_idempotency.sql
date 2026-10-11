-- +goose Up
ALTER TABLE usage_records ADD COLUMN event_id TEXT UNIQUE;
-- Collection is transactional; a closed period can receive further deltas
-- when late edge batches arrive. Keep the old Stripe key for pending retries.
ALTER TABLE metered_usage ADD COLUMN stripe_identifier TEXT;
UPDATE metered_usage SET stripe_identifier = 'mu_' || org_id || '_' || metric || '_' || floor(extract(epoch FROM window_start))::bigint::text;
ALTER TABLE metered_usage DROP CONSTRAINT metered_usage_org_id_metric_window_start_key;

-- +goose Down
-- Rollback fails safely if new delta rows would violate the former constraint;
-- consolidate/archive those rows explicitly before reverting the schema.
ALTER TABLE metered_usage ADD CONSTRAINT metered_usage_org_id_metric_window_start_key UNIQUE (org_id, metric, window_start);
ALTER TABLE usage_records DROP COLUMN event_id;
ALTER TABLE metered_usage DROP COLUMN stripe_identifier;

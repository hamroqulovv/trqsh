-- +goose Up
-- +goose StatementBegin

-- Admin controls (approve.<base>). A disabled user cannot sign in or refresh a
-- session; a suspended org's API keys stop authenticating, which also blocks
-- tunnel binds at the edge. NULL means active.
ALTER TABLE users ADD COLUMN disabled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN disabled_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE orgs  ADD COLUMN suspended_at TIMESTAMPTZ;
ALTER TABLE orgs  ADD COLUMN suspended_reason TEXT NOT NULL DEFAULT '';

-- Append-only record of every admin mutation: who did what to which object, from
-- where, and the before/after values. The API only ever inserts and reads.
CREATE TABLE admin_audit (
    id          BIGSERIAL PRIMARY KEY,
    at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor       TEXT NOT NULL DEFAULT '',
    action      TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT '',
    target_id   TEXT NOT NULL DEFAULT '',
    summary     TEXT NOT NULL DEFAULT '',
    detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip          TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_admin_audit_at ON admin_audit (at DESC);
CREATE INDEX idx_admin_audit_target ON admin_audit (target_type, target_id, at DESC);

-- Global directory searches (admin).
CREATE INDEX idx_users_created ON users (created_at DESC);
CREATE INDEX idx_orgs_created ON orgs (created_at DESC);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_orgs_created;
DROP INDEX IF EXISTS idx_users_created;
DROP TABLE IF EXISTS admin_audit;
ALTER TABLE orgs  DROP COLUMN IF EXISTS suspended_reason;
ALTER TABLE orgs  DROP COLUMN IF EXISTS suspended_at;
ALTER TABLE users DROP COLUMN IF EXISTS disabled_reason;
ALTER TABLE users DROP COLUMN IF EXISTS disabled_at;
-- +goose StatementEnd

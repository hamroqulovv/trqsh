-- +goose Up
-- One TRQSH account (one email) can sign in with several OAuth providers. Each
-- provider account is a stable (provider, subject) identity that points at the
-- user; users.oauth_provider/oauth_subject keep recording the first one.
CREATE TABLE user_identities (
    provider   TEXT NOT NULL,
    subject    TEXT NOT NULL,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, subject)
);
-- A user links at most one account per provider.
CREATE UNIQUE INDEX user_identities_user_provider ON user_identities (user_id, provider);

INSERT INTO user_identities (provider, subject, user_id, created_at)
SELECT oauth_provider, oauth_subject, id, created_at
FROM users
WHERE oauth_provider <> '' AND oauth_subject <> '';

-- +goose Down
DROP TABLE user_identities;

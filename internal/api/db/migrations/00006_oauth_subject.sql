-- +goose Up
ALTER TABLE users ADD COLUMN oauth_subject TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX users_oauth_identity ON users (oauth_provider, oauth_subject)
    WHERE oauth_subject <> '';
CREATE UNIQUE INDEX users_email_normalized ON users (lower(email));

-- +goose Down
DROP INDEX users_oauth_identity;
DROP INDEX users_email_normalized;
ALTER TABLE users DROP COLUMN oauth_subject;

#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

mkdir -p /data/postgres /data/redis /data/tls /data/usage /run/trqsh
chown postgres:postgres /data/postgres
chmod 700 /data/postgres
chown redis:redis /data/redis
chown app:app /data/tls /data/usage

# Keep generated credentials with the database, including across image rebuilds.
if [ ! -f /data/runtime.env ]; then
    {
        printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)"
        printf 'TRQSH_JWT_SECRET=%s\n' "$(openssl rand -hex 32)"
        printf 'TRQSH_INTERNAL_TOKEN=%s\n' "$(openssl rand -hex 32)"
    } > /data/runtime.env.tmp
    mv /data/runtime.env.tmp /data/runtime.env
fi
set -a
. /data/runtime.env
set +a

export TRQSH_ENV="${TRQSH_ENV:-development}"
export TRQSH_DEV_AUTH="${TRQSH_DEV_AUTH:-1}"
export TRQSH_BASE_DOMAIN="${TRQSH_BASE_DOMAIN:-tunnel.trqsh.uz}"
export TRQSH_API_PUBLIC_URL="${TRQSH_API_PUBLIC_URL:-https://tunnel.trqsh.uz}"
export TRQSH_APP_URL="${TRQSH_API_PUBLIC_URL}/dashboard"
export TRQSH_QR_URL="${TRQSH_APP_URL}/remote"
export TRQSH_DATABASE_URL="postgres://trqsh:${POSTGRES_PASSWORD}@127.0.0.1:5432/trqsh?sslmode=disable"
export TRQSH_REDIS_URL=redis://127.0.0.1:6379/0
export TRQSH_API_ADDR=127.0.0.1:8080
export TRQSH_API_URL=http://127.0.0.1:8080
export TRQSH_API_INTERNAL_URL=http://127.0.0.1:8080
export TRQSH_ENTITLEMENTS=api
export TRQSH_TLS_STORAGE_DIR=/data/tls
export TRQSH_USAGE_SPOOL_DIR=/data/usage
export TRQSH_SITE_UPSTREAM=http://127.0.0.1:3000
export TRQSH_APP_UPSTREAM=http://127.0.0.1:3001
export TRQSH_API_UPSTREAM=http://127.0.0.1:8080
export GOOSE_DRIVER=postgres GOOSE_DBSTRING="$TRQSH_DATABASE_URL" GOOSE_MIGRATION_DIR=/migrations

exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf

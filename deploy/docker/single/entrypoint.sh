#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# An explicit --user 0 --prepare-data run migrates volumes from the original
# root-supervised image. Normal startup and every service run as app (10001).
if [ "$(id -u)" = 0 ]; then
    mkdir -p /data/postgres /data/redis /data/tls /data/usage /run/trqsh
    chown -R app:app /data /run/trqsh /var/run/postgresql
    if [ "${1:-}" = --prepare-data ]; then
        exit 0
    fi
    exec gosu app "$0" "$@"
fi

if [ ! -w /data ] || { [ -f /data/runtime.env ] && [ ! -r /data/runtime.env ]; }; then
    printf 'Data volume needs ownership migration. See deploy/SINGLE-CONTAINER.md: Upgrading an existing volume.\n' >&2
    exit 1
fi
mkdir -p /data/postgres /data/redis /data/tls /data/usage /run/trqsh
for directory in /data/postgres /data/redis /data/tls /data/usage; do
    if [ ! -w "$directory" ]; then
        printf 'Data volume needs ownership migration. See deploy/SINGLE-CONTAINER.md: Upgrading an existing volume.\n' >&2
        exit 1
    fi
done
chmod 700 /data/postgres
if [ "${1:-}" = --prepare-data ]; then
    exit 0
fi

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

export TRQSH_ENV="${TRQSH_ENV:-production}"
export TRQSH_DEV_AUTH=0
export TRQSH_BASE_DOMAIN="${TRQSH_BASE_DOMAIN:-trqsh.uz}"
export TRQSH_API_PUBLIC_URL="${TRQSH_API_PUBLIC_URL:-https://api.trqsh.uz}"
export TRQSH_APP_URL="${TRQSH_APP_URL:-https://app.trqsh.uz}"
export TRQSH_QR_URL="${TRQSH_QR_URL:-https://qr.trqsh.uz}"
export TRQSH_DATABASE_URL="postgres://trqsh:${POSTGRES_PASSWORD}@127.0.0.1:5432/trqsh?sslmode=disable"
export TRQSH_REDIS_URL=redis://127.0.0.1:6379/0
export TRQSH_API_ADDR=0.0.0.0:8080
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

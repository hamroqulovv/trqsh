#!/usr/bin/env bash
set -Eeuo pipefail

wait_for() {
    local attempt
    for attempt in {1..120}; do
        if "$@" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done
    printf 'Timed out waiting for %s\n' "$1" >&2
    return 1
}

case "${1:-}" in
    api)
        wait_for pg_isready -q -h 127.0.0.1 -U trqsh -d trqsh
        wait_for redis-cli -h 127.0.0.1 ping
        goose up
        exec /usr/local/bin/trqshapi
        ;;
    edge)
        wait_for curl --max-time 2 -fsS http://127.0.0.1:8080/healthz
        exec /usr/local/bin/trqshd
        ;;
    *)
        printf 'Unknown service: %s\n' "${1:-}" >&2
        exit 1
        ;;
esac

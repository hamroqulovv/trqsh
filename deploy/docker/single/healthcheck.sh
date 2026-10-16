#!/usr/bin/env bash
set -Eeuo pipefail
pg_isready -q -h 127.0.0.1 -U trqsh -d trqsh
test "$(redis-cli -h 127.0.0.1 ping)" = PONG
curl --max-time 3 -fsS http://127.0.0.1:8080/healthz >/dev/null
curl --max-time 3 -fsS http://127.0.0.1:9090/healthz >/dev/null
curl --max-time 3 -fsS http://127.0.0.1:3001/dashboard/login >/dev/null
curl --max-time 3 -fsS http://127.0.0.1:3000/ >/dev/null

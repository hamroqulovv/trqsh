# Backend audit fixes

The 15 reproduced findings from the 2026-10-10 backend audit are addressed in this change. Regression tests now live in the repository alongside the affected packages.

| Audit finding | Resulting behavior |
| --- | --- |
| 1. Session cookies reached tenant tunnels | API and dashboard sessions use host-only cookies. Production uses `__Host-` names. Dashboard OAuth uses a browser-bound, one-use exchange code instead of shared cookies. Legacy JWT sessions are rejected using a new required audience. |
| 2. Platform host takeover | The apex and `api`, `app`, `approve`, `qr`, `www` labels are forbidden for tenant reservations/binds. Platform ingress precedes tenant lookup, including legacy hub entries. |
| 3. Admin CSRF | Production mutations require the exact admin host/origin, JSON bodies and a CSRF token derived from the authenticated session. Login also checks origin and media type. |
| 4. Verified TCP TLS failed | The TCP dialer derives a missing TLS ServerName from the target address and preserves explicit overrides. |
| 5. Reconnect lost tunnels | Reconnect retains the user's original reservation/domain specification, restores assigned ports, and retains failed binds for recovery with bounded transient retries. Random HTTP names may change after reconnect. |
| 6. Webhook retry lost plan changes | The event marker and all billing state updates commit together. Failed processing rolls back, allowing retries. |
| 7. Periodic PAYG metering missed later traffic | Collection subtracts previously queued quantities inside a transaction and creates immutable delta rows with distinct Stripe identifiers. Late batches can produce another delta for a closed period. |
| 8. Concurrent tunnel limits were unenforced | Account slots are acquired atomically across sessions and edges sharing Redis, renewed while live and released on failure/teardown. |
| 9. HTTP/2 and HTTP/3 IP spoofing | Every public HTTP path overwrites forwarded IP headers from the peer address and removes untrusted `Forwarded`. |
| 10. Metering ignored the end boundary | Collection includes whole usage batches whose end timestamp lies in `(start, end]`. Later-period batches are excluded. Partial overlapping collection ranges are rejected. |
| 11. Chunked traffic was uncounted | Request/response body readers count actual bytes, including streaming bodies and partial transfers. |
| 12. Usage disappeared during outages | Failed batches keep a stable event ID and frozen interval, persist before delivery and retry until acknowledged. API storage failures return errors; database inserts deduplicate by event ID. |
| 13. Registry ownership was unprotected | Bind cannot replace another live owner. Refresh and deletion compare the edge/session owner atomically. Automatic TCP/UDP allocation skips ports held by other edges. |
| 14. Duplicate tunnel IDs left orphan routes | Empty/duplicate client IDs are rejected before allocation, lifecycle operations are serialized, and cleanup is idempotent. Duplicate custom-host attempts preserve the original route. |
| 15. Logout retained agent identity | Logout/account switch closes the previous session, clears live identity/tunnels and invalidates in-flight connection/bind work. Explicit logout also prevents the development credential fallback. |

## Updating a deployment

1. Apply `internal/api/db/migrations/00005_usage_idempotency.sql` before starting the updated API. It adds usage event IDs, preserves existing Stripe identifiers and permits multiple delta rows per period.
2. Update API and dashboard together. The new OAuth routes are `/login/oauth/{provider}`, `/login/callback` and API `POST /v1/auth/dashboard/exchange`. Keep `TRQSH_APP_URL` pointing at the dashboard and its configured base path; keep the OAuth provider's callback pointing at the API.
3. Users must sign in again. Pre-update access and refresh JWTs intentionally fail verification so previously exposed credentials cannot remain valid. Agent API keys are unaffected.
4. Update all edges together with the registry ownership changes. A mixed deployment containing old edges can still overwrite/delete routes using the old unconditional operations. All edges in one cluster must share `TRQSH_REDIS_URL` for a cluster-wide tunnel limit.
5. Preserve pending usage. API-backed edges with Redis use persistent `trqsh:usage:*` keys and recover their batches using a stable `TRQSH_EDGE_ID`. A replacement must reuse that identity; when retiring an edge permanently, recover/drain its pending namespace before discarding it. Avoid simultaneous unrelated edges using the same ID. Redis must have persistence and a persistent data volume. Production Compose now uses AOF with `appendfsync always`; this trades Redis write throughput for persistence before acknowledgement. External Redis deployments must configure equivalent durability.
6. Without Redis, API-backed edges use `TRQSH_USAGE_SPOOL_DIR`, defaulting under the TLS storage directory or user cache. Mount this directory persistently and retain it when replacing the edge. The current aggregation window (up to 30 seconds) is still held in memory until it is flushed; a hard process crash can lose that unflushed window.

No deployment, commit or database migration against application data was performed during this work.

Do not blindly roll back migration 00005 after collecting new deltas. Its Down migration fails if the old unique constraint cannot be restored. Consolidate/archive duplicate period rows deliberately first, retaining their Stripe reconciliation history. Returning to old auth/edge binaries would also restore the vulnerabilities.

## Verification

Run from the repository root with Go 1.26 or newer:

```sh
go test ./... -race -count=1 -timeout=180s
go vet ./...
```

The Postgres regression is opt-in. Set `TRQSH_TEST_DATABASE_URL` to an isolated disposable Postgres database; it creates and drops its own random schema, applies migrations, and checks transaction rollback/retry, event deduplication and bounded usage queries. Without this environment variable that test is skipped.

```sh
TRQSH_TEST_DATABASE_URL='postgres://postgres:password@localhost:5432/test?sslmode=disable' \
  go test ./internal/api/store -race -count=1 -run TestPostgresBillingAndUsageRegression
cd web/dashboard
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --test tests/paths.test.cjs
```

Redis tests use miniredis and exercise Lua ownership checks, concurrent quota allocation and queue recovery. OAuth tests use a local mock provider; Stripe tests use fake signed events/meter requests. Live provider/Stripe integration and production load were not exercised.

Verified on 2026-10-11 using Go 1.26 in Docker and a disposable Postgres 17.6 container:

- The full `go test ./... -race -count=1 -timeout=180s` run passed, including the opt-in Postgres regression.
- API and edge package race tests passed again after the final redirect-validation and usage-persistence changes.
- `go vet ./...` passed.
- Dashboard TypeScript checking and both destination-validation tests passed.
- Production Compose passed `docker compose --file deploy/docker-compose.prod.yml config --no-interpolate --quiet`.

The disposable test database/container was removed after verification.

The original audit's additional observations about `RateLimitRPS` enforcement and a TCP listener handshake deadline remain separate follow-up work. Raw TCP/UDP peer forwarding is still unavailable: direct port traffic must reach the owning edge.

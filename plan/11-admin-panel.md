# 11 — Admin Panel (approve.<base>)

**Owns:** `internal/api/handlers_admin*.go`, `internal/api/adminui/` (embedded SPA),
admin additions to `internal/api/store`, migration `00008_admin_controls.sql`.
**Depends on:** Part 05 (control API + store), Part 07 (subscriptions).

## Goal

One place with full, audited control over a trqsh deployment: every account, org,
key, domain, tunnel and subscription can be inspected and changed, and every
change is recorded. Before this part `approve.<base>` could only grant/revoke a
plan and browse four read-only lists.

## Decisions

- **Stays in the API process.** The console is a static SPA embedded in the API
  binary and served same-origin at `approve.<base>`. The edge routing, the
  `trqsh_admin` cookie and the CSRF/Origin guards keep working unchanged, and no
  new deployment unit or build step is required. The SPA is plain ES modules
  (no bundler), so `go build` is the whole toolchain.
- **Strict CSP.** The page loads only `'self'` scripts and styles (no inline
  script/style), is `noindex`, framed `DENY`, `no-store`.
- **Same visual language as web/site and web/dashboard**: monochrome RGB tokens,
  shared easing, spotlight cards, status never conveyed by colour alone.
- **Every mutation is audited** (`admin_audit`): actor, action, target, summary,
  client IP, before/after detail. The log is append-only through the API.
- **Destructive actions need a typed confirmation** in the UI and are refused by
  the API when they would orphan billing (an org with a live Stripe subscription
  cannot be deleted from here).
- **Suspension is enforced where credentials are minted/used**:
  org suspended → API keys stop authenticating (REST + edge bind); user disabled →
  login, OAuth callback and token refresh are refused. Already-issued 1h access
  tokens run out on their own, the same trade-off documented in `auth/revoke.go`.

## Capability matrix

| Area | Read | Change |
|---|---|---|
| Overview | KPIs, 30d traffic series, plan mix, geo, top orgs, live tunnels | — |
| Users | directory + search, detail (identities, orgs/roles, keys, activity) | rename, suspend/unsuspend, delete |
| Orgs | directory + filters, detail (members, usage vs limits, keys, domains, subdomains, subscription, tunnels) | rename, grant/revoke plan (+expiry), suspend/unsuspend, members add/remove/role, delete |
| API keys | all keys across orgs | revoke |
| Domains | all custom domains | force-verify, delete |
| Subdomains | all reservations | release, reserve for an org (bypasses plan cap) |
| Tunnels | live + history, filter by type/region/country/org/text | — (edge has no control channel yet) |
| Billing | subscriptions, pending metered usage queue, plan catalog | grant/revoke (manual) |
| Audit | filterable log | — |
| System | redacted config, runtime, providers, regions | — |
| Global | `⌘K` palette, cross-entity search | — |

## Tasks

1. **Store** — migration `00008`; `Store` additions (mem + Postgres): suspend/disable,
   rename, delete user/org, member management, admin-scoped key/subdomain/domain
   ops, global lists with totals, global usage series, top orgs, audit append/list.
2. **API** — `/v1/admin/*` handlers behind `requireAdmin`; audit helper; suspension
   checks in `auth.AuthenticateAPIKey`, `Refresh`, login and OAuth callback.
3. **Tests** — handler tests (authn, CSRF, each mutation + audit row, suspension
   enforcement, delete guards) and store tests for both backends' shared contract.
4. **UI** — embedded SPA: shell, router, palette, tables with server paging,
   detail views, confirm/toast primitives, charts as inline SVG.
5. **Docs/deploy** — `deploy/ADMIN-CONSOLE.md`, `.env` examples, this plan.

## Status

Implemented. Operator guide: [`deploy/ADMIN-CONSOLE.md`](../deploy/ADMIN-CONSOLE.md). The
store contract (`testAdminControls`) runs against the in-memory store always and against
Postgres through `TRQSH_TEST_DATABASE_URL`.

Not done, on purpose: a live-tunnel kill switch (the edge has no control channel from the
API yet) and per-person admin accounts / roles (the console is one shared operator login).

## Done criteria

- `go build ./... && go test ./internal/api/...` green.
- Admin can, from the browser: find a user, suspend them, see the audit row,
  unsuspend; grant a plan to an org; revoke an API key; force-verify a domain;
  delete a test org after typed confirmation.
- Unauthenticated / cross-origin / missing-CSRF requests to every new endpoint fail.

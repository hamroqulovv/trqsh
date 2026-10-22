# Admin console (`approve.<domain>`)

The operator console for a trqsh deployment: every account, organization, API key,
domain, tunnel and subscription can be inspected and changed from one place, and
every change is written to an audit log. It ships inside the control API binary —
there is nothing extra to deploy.

## Enable it

Set both variables in `deploy/.env` and restart the API:

```bash
TRQSH_ADMIN_USER=operator
TRQSH_ADMIN_PASSWORD=<a long random password>
```

Empty values disable the whole surface (the page, the login and every `/v1/admin/*`
route answer `404`). The edge already routes `approve.<domain>` to the API.

Locally: set the same two variables in `deploy/.env`, start the dev stack and open
`http://approve.lvh.me` (through the edge) or `http://localhost:8080/admin` (straight
to the API; outside production the page is served on any host).

## Security model

| Control | How |
| --- | --- |
| Authentication | One operator account from the two env variables, compared in constant time; login is rate-limited per IP. |
| Session | Signed, `HttpOnly`, `Secure` (production), `SameSite=Lax` cookie, 12 hours. No user JWT is ever accepted. |
| CSRF | Every state-changing request needs the `X-CSRF-Token` header **and** a same-origin `Origin` **and** a JSON body. In production the request must also arrive on `approve.<domain>`. |
| Page hardening | Strict CSP (`script-src 'self'; style-src 'self'`, no inline code), `frame-ancestors 'none'`, revalidated on every load, `noindex`. |
| Output safety | The UI never writes API data into HTML; everything is set as text. |
| Audit | Append-only `admin_audit` table: operator, action, target, summary, before/after, client IP. |
| Secrets | The System page reports which features are configured, never their values. |

Use a password manager value of 24+ characters and keep `approve.<domain>` behind
your usual perimeter (VPN or IP allow-list at the proxy) if you can. There is a
single shared operator identity; the audit log records *what* changed, so rotate the
password when someone leaves.

## What you can do

| Page | Read | Change |
| --- | --- | --- |
| **Overview** | KPIs, traffic chart (24h–90d), plan mix, live tunnels, countries, busiest orgs, recent admin activity | – |
| **Users** | Directory with search; detail with sign-in methods, organizations and admin history | Rename, **suspend / reinstate**, delete |
| **Organizations** | Directory with plan filter and search; detail with usage vs. limits, traffic, members, keys, domains, subdomains, subscription, tunnels | Change plan (+expiry), rename, **suspend / reinstate**, members (add, role, remove), reserve a subdomain, delete |
| **Tunnels** | Every session across all orgs with agent location; filters for state, type, region, text | – |
| **API keys** | All keys across orgs | Revoke |
| **Domains** | All custom domains and reserved subdomains | Force-verify, delete, release |
| **Billing** | Stripe subscriptions, metering queue, plan catalog | Grant / revoke a plan by email |
| **Audit log** | Filterable history of every change | – |
| **System** | Runtime, redacted configuration, features, regions | Copy diagnostics |

`Ctrl/⌘ K` (or `/`) opens a palette that jumps to any page and searches users,
organizations, domains and subdomains.

## Suspension semantics

- **Suspended organization** – all of its API keys stop authenticating immediately:
  the edge denies tunnel binds (`ERR_AUTH_INVALID`, "this account is suspended") and
  the REST API refuses the keys. Members can still sign in to the dashboard.
  Tunnels that are *already connected* stay up until their agent session ends;
  reconnects are then denied.
- **Suspended user** – cannot sign in (OAuth callback and dev login are refused) or
  refresh a session. A browser that is already signed in keeps working until its
  1-hour access token expires. Suspend the user's organization too if you need to cut
  off tunnels.
- **Deleting** is permanent. Deleting a user also deletes organizations they alone
  belong to; deleting an organization cascades to its keys, domains, subdomains,
  usage and tunnel history. The server refuses both while an organization still has a
  live Stripe subscription — cancel it in Stripe first. The UI requires the exact
  name or email to be typed back.

## Upgrading

Migration `00008_admin_controls.sql` adds `users.disabled_at`, `orgs.suspended_at`
and the `admin_audit` table. Run the usual migrate step before starting the new API
(`deploy/docker/Dockerfile.migrate`); the change is additive and the previous API
version keeps working against the new schema.

## Known limits

- No remote kill switch for a live tunnel yet: the edge has no control channel from
  the API (see the suspension note above).
- Plan limits live in code (`internal/billing/plans.go`) and are shown read-only.
- A single shared operator login; there are no per-person admin accounts or roles.

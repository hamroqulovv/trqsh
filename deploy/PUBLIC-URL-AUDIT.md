# Public URL audit — 2026-10-09

The running local stack is now published through the existing Cloudflare Tunnel
on a single HTTPS origin. Public navigation no longer points to localhost.

| Surface | Public URL |
| --- | --- |
| Site | https://trqsh.uz |
| Dashboard | https://trqsh.uz/dashboard |
| Login | https://trqsh.uz/dashboard/login |
| Control API base | https://trqsh.uz/v1 |
| Interactive API docs | https://trqsh.uz/api-docs |
| OpenAPI contract | https://trqsh.uz/openapi.yaml |
| Health | https://trqsh.uz/healthz |
| Device approval | https://trqsh.uz/dashboard/device |
| QR viewer | https://trqsh.uz/dashboard/remote/<code> |

## Changes

- Added `docker-compose.cloudflare.yml` over the existing dev/local stack.
  Site, dashboard and API use separate Cloudflare image names so local builds
  cannot overwrite their public build configuration.
- Site proxies `/dashboard`, `/v1` and public API documentation/health routes.
  Internal entitlement RPC and metrics remain unavailable on the public origin.
- Dashboard static files, fetch/SSE endpoints and form redirects retain the
  `/dashboard` mount path. Device codes survive sign-in redirects.
- Session cookies are Secure and HttpOnly on the HTTPS origin. Login and
  logout keep the public origin. Unconfigured OAuth buttons are hidden.
- API/device/QR URLs, canonical metadata, sitemap and robots use the public
  deployment URLs. Loopback examples in documentation remain readable text.
- SSE responses opt out of proxy compression. Only remote stream routes bypass
  the REST request timeout, and stream write deadlines renew with heartbeats.
- CLI control-API and desktop dashboard links in source now use trqsh.uz and
  `/dashboard`. Existing published desktop/CLI binaries were not re-released.

## Verification

| Check | Result |
| --- | --- |
| 26 public route checks + 11 dashboard JS/CSS assets | Passed, zero failures |
| Email form login, HTTPS cookies, preserved device redirect | Passed |
| All nine authenticated dashboard pages | HTTP 200; no loopback navigation links |
| Complete device authorization and agent API-key issuance | Passed |
| QR viewer URL, live transcript and command relay through Cloudflare | Passed |
| SSE transcript and command delivery after 65 seconds | Passed |
| Signed-in login redirect, invalid-session redirect and logout | Passed |
| Temporary audit accounts and remote sessions | Cleaned up |
| HTTP apex redirect to HTTPS; install.sh | HTTP 301 to HTTPS; HTTP 200 |
| Site/dashboard production builds and site/desktop TypeScript checks | Passed |
| Agent configuration Go tests | Passed |
| API remote/device Go tests, including stream beyond REST timeout | Passed |
| Compose validation and git diff whitespace check | Passed |
| Site, dashboard, API, edge, PostgreSQL and Redis containers | Healthy |

Repeat the read-only HTTP checks with:

```bash
node deploy/verify-public.mjs
```

Restart/rebuild the public configuration with:

```bash
docker compose -p trqsh-local -f deploy/docker-compose.dev.yml -f deploy/docker-compose.local.yml -f deploy/docker-compose.cloudflare.yml --profile web up -d --build --wait
# or: make cloudflare
```

`make local` intentionally restores localhost URLs; use the Cloudflare command
for this public deployment. PostgreSQL data volumes are retained.

## Remaining deployment limitations

The web/API/QR checks passed. This is not a complete public edge deployment:

- A direct TCP connection to `trqsh.uz:4443` timed out. The existing HTTP Tunnel
  points at the site's local port 3002; it does not expose the agent's QUIC/TCP
  transport. Wildcard tunnel hosts need DNS and routing to the edge as well.
- The API's default region catalog lists `eu.trqsh.uz`, `us.trqsh.uz` and
  `ap.trqsh.uz`; none resolved in the live DNS checks. Those regions are not
  available from this deployment. Public CLI tunneling cannot be marked passed.
- `TRQSH_DEV_AUTH=1` and development authentication secrets are still inherited
  from the existing local stack. Email login is passwordless; OAuth providers
  are unconfigured. Real-user production use requires OAuth credentials,
  strong signing/internal secrets and disabling development authentication.
- The cloud inspector page is a placeholder for a future capture relay. The
  agent's local inspector is documented separately.

Cloudflare documents the separate client/connectivity requirements for
[non-HTTP published applications](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/protocols/).

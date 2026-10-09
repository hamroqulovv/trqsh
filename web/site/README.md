# web/site — Marketing site & docs

The public face of trqsh: landing, pricing, download, and the full documentation
(including a generated API reference). **Next.js 15** (App Router) + **TypeScript** +
**Tailwind**, with a hand-written shadcn-style UI kit. Lives at
**[trqsh.uz](https://trqsh.uz)**.

Part of the [trqsh monorepo](../../README.md) — the backend it links to lives in
[`cmd/`](../../cmd) / [`internal/`](../../internal). Marketing and documentation
share a monochrome design system in `app/globals.css`.

## Design and navigation

The site has white and black themes, a static wordmark, and neutral borders.
The header's theme button is available on desktop and mobile. Explicit choices
persist in local storage; otherwise the site follows the system color scheme.
A small head script applies the theme before paint, and other open tabs sync
when the saved preference changes. Primary actions adapt to each palette, while
terminal examples and promotional panels retain a readable dark palette.
The landing page contains an interactive HTTP/TCP/UDP command example
and a three-step onboarding guide. Sample terminal output is explicitly labeled.
Mobile menus support Escape and close after navigation; all pages have a skip link.

Pricing amounts and limits come from the generated catalog, including annual
billing. Paid plans open the existing Telegram upgrade flow. Downloads allow
explicit platform and architecture selection, falling back to a matching CLI
archive when a desktop build is unavailable. CLI and desktop versions are shown
separately. The docs sidebar filters guides locally with an empty state.

## Run

```bash
pnpm install
pnpm dev        # http://localhost:3002
pnpm build      # production build
pnpm typecheck
```

Runs on **:3002** so it can coexist with the dashboard (:3000) locally.

## Content is generated from the live API (never hardcoded)

Two pieces of content are generated from a running control API at build/regenerate time,
then **checked in** — so a normal `pnpm build` never needs the API to be up, only
regeneration does. This keeps the site's numbers from ever drifting from what the edge
actually enforces, and lets the site build with no Go toolchain:

- **Pricing** — `lib/catalog.generated.ts` is produced by `scripts/genplans.mjs`, which
  fetches `GET $TRQSH_API_URL/v1/plans/public` (the unauthenticated plan catalog).
- **API reference** — `lib/openapi.generated.yaml` is produced by `scripts/gen-openapi.mjs`,
  which fetches `$TRQSH_API_URL/openapi.yaml`; the `/docs/api` page renders from it.

Regenerate after the backend's plan catalog or OpenAPI changes:

```bash
node scripts/genplans.mjs
node scripts/gen-openapi.mjs
# or, from the repo root:  make site-plans site-openapi
```

CI re-runs both and fails on any diff, so the checked-in copies can't silently go stale.
Docs pages render from Markdown in [`docs/content/`](../../docs/content).

## Deploy-time env

| Var | Default | Purpose |
|---|---|---|
| `TRQSH_DASHBOARD_URL` | `https://app.trqsh.uz` | Sign-up / login CTAs |
| `TRQSH_API_URL` | `https://api.trqsh.uz` | OAuth deep-links + build-time content fetch |
| `TRQSH_GITHUB_REPO` | `uzcreator/trqsh` | Source code / desktop GUI release links |
| `TRQSH_CLI_GITHUB_REPO` | `uzcreator/trqshcli` | CLI release / download links |
| `TRQSH_SITE_URL` | `https://trqsh.uz` | Canonical origin, sitemap, OG |
| `TRQSH_LATEST_VERSION` | see `lib/site.ts` | Download artifact filenames |
| `TRQSH_DOCS_CONTENT_DIR` | `../../docs/content` | Server-side Markdown directory; Docker sets `/app/content` |
| `TRQSH_DASHBOARD_INTERNAL_URL` | unset | Enable the `/dashboard` reverse proxy; Cloudflare overlay uses `http://dashboard:3000` |
| `TRQSH_API_INTERNAL_URL` | unset | Forward public API routes and load the deployed OpenAPI contract; Cloudflare overlay uses `http://api:8080` |

For the existing local Cloudflare Tunnel, use `make cloudflare` at the repo
root. It builds public links to `https://trqsh.uz/dashboard` and
`https://trqsh.uz/v1` while keeping the Tunnel's local HTTP origin on port 3002.

## Deploy

Built as a Docker image
([`deploy/docker/Dockerfile.site`](../../deploy/docker/Dockerfile.site) — a self-contained
Next.js standalone server) and published to `ghcr.io/uzcreator/site` by
[`.github/workflows/images.yml`](../../.github/workflows/images.yml). See
[`deploy/`](../../deploy) for how it runs behind the edge, which reverse-proxies the apex
domain to it.

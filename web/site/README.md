![trqsh — Localhost, online.](../../packaging/assets/readme-banner.svg)

Production now uses `trqsh.uz`, `app.trqsh.uz` and `api.trqsh.uz` with GitHub/Google-only sign-in. See [domain and OAuth setup](../../deploy/DOMAIN-AUTH.md). The single-origin `/dashboard` examples below describe the previous deployment.

# trqsh · Website & documentation

**The public product experience: discover, download and learn.**

The public face of trqsh: landing, pricing, download, and the full documentation
(including a generated API reference). **Next.js 15** (App Router) + **TypeScript** +
**Tailwind**, with a hand-written shadcn-style UI kit. Lives at
**[trqsh.uz](https://trqsh.uz)**.

Part of the [trqsh monorepo](../../README.md) — the backend it links to lives in
[`cmd/`](../../cmd) / [`internal/`](../../internal). Marketing and documentation
share a monochrome design system in `app/globals.css`.

Public pages use open columns, compact command strips, and horizontal dividers.
Avoid wrapping entire sections in rounded panels or nesting content cards;
reserve filled surfaces for interactive controls, code, and product previews.

[Quick start](#quick-start) · [Design](#design-and-navigation) · [Generated content](#generated-content) · [Documentation](#documentation-editing) · [Configuration](#configuration) · [Deployment](#deployment)

| Package | Stack | Development URL |
| --- | --- | --- |
| `trqsh-site` · private | Next.js 15 · React 19 · TypeScript · Tailwind | `http://localhost:3002` |

## Design and navigation

The site has white and black themes, a static wordmark, and neutral borders.
The header's theme button is available on desktop and mobile. Explicit choices
persist in local storage; otherwise the site follows the system color scheme.
A small head script applies the theme before paint, and other open tabs sync
when the saved preference changes. Primary actions adapt to each palette, while
terminal examples and promotional panels retain a readable dark palette.
The landing page opens with an interactive SVG connection example. A labeled
request travels from a browser, webhook sender, or API client through a public
URL to localhost. The local app processes it and sends a labeled response back.
Flowing routes, packet trails, relay activity, and progress indicators share this
sequence. Example selectors and a pause button support keyboard and touch use.
Phones get a vertical composition with larger labels; wider screens use a
horizontal layout. Both render with the page and follow the active theme without
WebGL. Motion is capped at 60 fps (30 on phones), pauses offscreen or in a hidden
tab, and becomes a still illustration when reduced motion is enabled.
The interactive HTTP/TCP/UDP command example has a moving protocol selector,
typed commands, and an animated connection diagram. Sample output is labeled.
Headlines enter word by word, content reveals once on scroll, and cards and
buttons have hover feedback. The sticky navigation includes reading progress.
All motion respects the visitor's reduced-motion preference, and content stays
readable without JavaScript. Pricing and download share the same interactions.
Mobile menus support Escape and close after navigation; all pages have a skip link.

Pricing amounts and limits come from the generated catalog, including annual
billing. Paid plans open the existing Telegram upgrade flow. Downloads allow
explicit platform and architecture selection, falling back to a matching CLI
archive when a desktop build is unavailable. CLI and desktop versions are shown
separately. The docs sidebar filters guides locally with an empty state.

The `/changelog` timeline includes all published CLI and desktop release records,
product filters, full-text search, stable version permalinks, and expandable
original notes. Editorial summaries link back to their sources; desktop builds
whose original notes say “preview” remain labeled as previews even when GitHub's
prerelease flag is false. All releases render on the server and remain readable
without JavaScript. The orbit graphic and entry animations respect reduced motion.

`/privacy`, `/terms`, `/cookies`, and `/acceptable-use` share a policy layout with
section navigation, concise summaries, and the confirmed contact `hello@trqsh.uz`.
Policy dates are explicit content revision dates, not the current build year.
Keep the claims in `lib/policies.tsx` aligned with the implementation: local
captures are bounded in-memory records, QR relay sessions are temporary, usage
and tunnel history are server-side records, and public upgrades are manual.
Do not infer production hosting locations or retention schedules from optional
deployment templates, or promise account export/deletion controls that do not exist.

## Quick start

Run from the repository root, with Node.js and pnpm installed:

```bash
cd web/site
pnpm install --frozen-lockfile
pnpm dev        # http://localhost:3002
pnpm build      # production build
pnpm typecheck
```

Runs on **:3002** so it can coexist with the dashboard (:3000) locally.

| Command | Result |
| --- | --- |
| `pnpm dev` | Development server on port 3002. |
| `pnpm typecheck` | TypeScript validation. |
| `pnpm build` | Production build using checked-in content snapshots. |
| `pnpm start` | Serve the production build on port 3002. |
| `pnpm gen:plans` | Refresh the public plan catalog from the configured API. |
| `pnpm gen:openapi` | Refresh the embedded OpenAPI contract. |

## Generated content

Two pieces of content are generated from a running control API at build/regenerate time,
then **checked in** — so a normal `pnpm build` never needs the API to be up, only
regeneration does. These snapshots let the site build without a Go toolchain;
refresh them when the backend catalog or API contract changes:

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

CI compares the OpenAPI copies to this revision's canonical `docs/openapi.yaml`.
Pricing regeneration uses the configured live API and checks for a diff when reachable.
Docs pages render from Markdown in [`docs/content/`](../../docs/content).

The changelog has a separate checked-in snapshot, `lib/changelog.generated.json`,
from the official `trqsh-tunnel/trqshcli` and `trqsh-tunnel/trqsh` GitHub release
APIs. Builds do not call GitHub. Refresh it from `web/site` after a release:

```bash
node scripts/gen-changelog.mjs
# Or use an existing authenticated GitHub CLI session:
node scripts/gen-changelog.mjs --github-cli
```

The generator paginates both repositories, excludes drafts, deduplicates migrated
CLI releases, and preserves the original notes and publication timestamps. It
supports `GITHUB_TOKEN` through the environment when needed; credentials are
never included in the snapshot. Review the snapshot and add an editorial
description in `lib/changelog.ts` where useful. New releases have a fallback
description until one is written. Update the CLI download default in `lib/site.ts`
and `next.config.mjs` when a new stable CLI release is published.
The direct download list currently matches CLI 0.2.5's six native archives;
that release does not publish Debian or RPM packages. Verify actual release
assets before adding package links.

## Documentation editing

The docs include 18 Markdown guides plus the Control API and stable edge-error
references. See [the source index](../../docs/README.md) for guide scope and
maintenance steps. CLI examples distinguish shell invocations from commands
inside the current interactive console. Verify examples against the command
registry/config loader before editing them.

Add a guide to `lib/docs-nav.ts` as well as `docs/content/`; this registers its
route, sidebar entry, previous/next order and sitemap entry. H2/H3 headings
generate stable anchors and the table of contents. Code blocks gain copy buttons
after hydration; without JavaScript the Markdown remains readable. Reference
tables and code blocks scroll within their containers on small screens.

`/docs/api` displays parameters, inline and named schemas, request bodies and
documented responses from the checked-in contract. `/openapi.yaml` instead
fetches the deployed API contract and substitutes this build's API origin.
These can differ until a backend contract update is deployed. Keep the source
and embedded copies in sync, and regenerate from an API running the same revision.

Validate a docs change with `pnpm typecheck`, `pnpm test`, `pnpm build`, then
`pnpm check:seo` against `pnpm start` for internal links and anchors, and browser
checks of code copying, mobile navigation and both themes.
For the existing complete Docker stack, rebuild/recreate only the `site` service
with the commands in [Self-hosting](../../docs/content/self-hosting.md).

## Search engine optimisation

- **Canonical and `og:url`** — the root layout sets both to `"./"`, which Next
  resolves per route against `TRQSH_SITE_URL`, so every page names itself with
  query strings dropped. A page only sets `title` and `description`; its social
  card title and description follow them. Do not give a page its own `openGraph`
  object: it replaces the root one, including the generated share image.
- **Descriptions** — a guide's meta description is its opening paragraph
  (`docDescription` in `lib/docs.ts`), so it always matches the page.
- **Structured data** — `lib/seo.ts` builds the home page's Organization and
  WebSite graph and the docs breadcrumbs, rendered by `components/json-ld.tsx`
  and `components/docs-breadcrumb.tsx`. There is no site search, so no
  `SearchAction`.
- **Sitemap** — `app/sitemap.ts` lists the home page, the docs (from
  `lib/docs-nav.ts`), download, pricing, changelog and policies. `lastmod` is
  set only where a page shows its own date. `/upgrade` is noindex and stays out;
  `pnpm test` fails for any page that is neither listed nor noindex.
- **Not pages** — `/install*`, `/openapi.yaml` and `/upgrade` send
  `X-Robots-Tag: noindex`, and the `www.` host redirects to the canonical one
  (both in `next.config.mjs`).
- **Checks** — `pnpm test` runs the real modules without a server. Against a
  running build, `pnpm check:seo [url]` audits the HTML that comes back:
  canonicals, titles, social tags, headings, JSON-LD, redirects and every
  internal link and anchor. After a deploy, `node deploy/verify-public.mjs`.

## Configuration

| Var                            | Default                | Purpose                                                                                                     |
| ------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `TRQSH_DASHBOARD_URL`          | `https://app.trqsh.uz` | Sign-up / login CTAs                                                                                        |
| `TRQSH_API_URL`                | `https://api.trqsh.uz` | OAuth deep-links + build-time content fetch                                                                 |
| `TRQSH_GITHUB_REPO`            | `trqsh-tunnel/trqsh`   | Source code / desktop GUI release links                                                                     |
| `TRQSH_CLI_GITHUB_REPO`        | `trqsh-tunnel/trqshcli` | CLI release / download links                                                                               |
| `TRQSH_SITE_URL`               | `https://trqsh.uz`     | Canonical origin, sitemap, OG                                                                               |
| `TRQSH_LATEST_VERSION`         | see `lib/site.ts`      | Download artifact filenames                                                                                 |
| `TRQSH_DESKTOP_VERSION`        | see `lib/downloads.ts` | Desktop release version; independent of the CLI version                                                      |
| `TRQSH_DOCS_CONTENT_DIR`       | `../../docs/content`   | Server-side Markdown directory; Docker sets `/app/content`                                                  |
| `TRQSH_DASHBOARD_INTERNAL_URL` | unset                  | Enable the `/dashboard` reverse proxy; Cloudflare overlay uses `http://dashboard:3000`                      |
| `TRQSH_API_INTERNAL_URL`       | unset                  | Forward public API routes and load the deployed OpenAPI contract; Cloudflare overlay uses `http://api:8080` |

For the existing local Cloudflare Tunnel, use `make cloudflare` at the repo
root. It builds public links to `https://trqsh.uz/dashboard` and
`https://trqsh.uz/v1`. Set the Tunnel's local HTTP origin to `http://localhost:3004`.

## Project layout

```text
app/(marketing)/       Landing, pricing, downloads, changelog and policies
app/docs/              Markdown guides and API/error references
components/            Navigation, motion, download and UI components
lib/                   Site configuration, docs navigation and generated data
scripts/               Plan catalog, OpenAPI and release-history generators
public/install.sh      Public copy of the shell installer
../../docs/content/    Source Markdown guides
```

## Deployment

Built as a Docker image
([`deploy/docker/Dockerfile.site`](../../deploy/docker/Dockerfile.site) — a self-contained
Next.js standalone server) and published to `ghcr.io/<repository-owner>/site` by
[`.github/workflows/images.yml`](../../.github/workflows/images.yml). See
[`deploy/`](../../deploy) for how it runs behind the edge, which reverse-proxies the apex
domain to it.

Repository URL defaults use the current `trqsh-tunnel` owner. Review
`TRQSH_GITHUB_REPO` and `TRQSH_CLI_GITHUB_REPO` for deployments that override them.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Pricing or API reference is stale | Regenerate from the intended API revision and review the checked-in diff. |
| A guide has no route or sidebar entry | Register it in `lib/docs-nav.ts` and check its source path. |
| Download points to an old artifact | Check CLI/desktop versions and release-repository settings. |
| `/dashboard` proxy fails | Align the internal URL, dashboard base path and proxy configuration. |

---

[Project overview](../../README.md) · [Content index](../../docs/README.md) · [Dashboard](../dashboard/README.md) · [License](../../LICENSE)

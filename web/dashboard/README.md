# web/dashboard — User dashboard

The authenticated web control surface: tunnels, domains, API keys, usage, billing, and the
cloud request inspector. **Next.js 15** (App Router) + **TypeScript** + **Tailwind**,
talking only to the control API (`trqshapi`, in [`cmd/trqshapi`](../../cmd/trqshapi) /
[`internal/api`](../../internal/api)). Served at **app.trqsh.uz**.

Part of the [trqsh monorepo](../../README.md); shares design tokens with
[`web/site`](../site) and [`desktop`](../../desktop).

## Run

```bash
pnpm install
# point at a running control API; defaults to http://localhost:8080
export TRQSH_API_URL=http://localhost:8080
export NEXT_PUBLIC_TRQSH_BASE_DOMAIN=lvh.me
pnpm dev            # http://localhost:3000
# production build:
pnpm build && pnpm start
```

Bring the API up with `make dev` from the repo root.

## How it works

- **Auth** — the JWT session lives in **httpOnly cookies** set by a Server Action on login;
  `middleware.ts` guards every route. The token never reaches the browser: reads happen in
  Server Components via `lib/api.ts`, writes go through Server Actions, and a 401
  transparently refreshes and retries.
- **Data** — `lib/api.ts` is a typed client for the control API (see
  [`docs/openapi.yaml`](../../docs/openapi.yaml)). No direct Postgres/Redis access.
- **Billing** — the billing screen embeds Stripe: plan cards open **Checkout** and
  "Manage billing" opens the **Customer Portal** (both via Server Actions). Plan changes
  land through the webhook, so the UI reflects them on the next load.
- **Design** — neutral white/black palettes in `app/globals.css` + `tailwind.config.ts`
  match the marketing site. The login and dashboard theme controls share the site's
  `localStorage.theme` preference on the same origin, synchronize across tabs, and
  follow the system setting until a preference is saved. A head script applies the
  palette before the first paint, including when application JavaScript is delayed.
- **Login** — a responsive product panel and focused sign-in form replace the old
  centered card. "Create an account" reveals the optional name field; both modes
  use the existing email Server Action. Only configured OAuth providers appear.
  Public navigation defaults to `https://trqsh.uz`; an optional build-time
  `NEXT_PUBLIC_TRQSH_SITE_URL` changes the home, docs and legal links.

## Structure

```
app/(dashboard)/   protected app: overview, tunnels, domains, keys, usage,
                   inspect, billing, team, settings (each page + its actions)
app/login/         public login (email dev flow + OAuth links)
components/         nav, topbar, tiles, charts, ui/ primitives (shadcn-style)
lib/               api client, session cookies, error mapping, formatting
middleware.ts      route protection
```

## Deploy

Built as a Docker image
([`deploy/docker/Dockerfile.dashboard`](../../deploy/docker/Dockerfile.dashboard)) and
published to `ghcr.io/uzcreator/dashboard` by
[`.github/workflows/images.yml`](../../.github/workflows/images.yml). `TRQSH_API_URL` and
`NEXT_PUBLIC_TRQSH_BASE_DOMAIN` are inlined at **build** time, so the published image bakes
the production values; see [`deploy/PRODUCTION.md`](../../deploy/PRODUCTION.md).

Set `TRQSH_API_INTERNAL_URL` at runtime to route server-side data, authentication,
and remote-viewer proxy requests over the Docker network (for example,
`http://api:8080`). Both Compose stacks set this automatically. Browser OAuth
links still use the public `TRQSH_API_URL` baked into the image. When the internal
URL is unset, server-side requests fall back to that public URL.

The persistent local Compose stack (`make local`) runs the optimized image at
`http://localhost:3000` with `TRQSH_ENV=development`. This explicit local mode
sets host-only cookies over HTTP. Production keeps secure cookies scoped to the
base domain.

`make cloudflare` mounts the same app at `https://trqsh.uz/dashboard` by
building with `NEXT_PUBLIC_TRQSH_DASHBOARD_BASE_PATH=/dashboard` and the public
API origin `https://trqsh.uz`. Next navigation, action redirects, static assets
and remote-viewer fetch/SSE paths include the mount path. Session cookies are
Secure on the public HTTPS origin even while the local API uses dev auth.

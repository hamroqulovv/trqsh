<div align="center">

<img src="assets/brand/trqsh-logo-rounded.svg" width="160" height="160" alt="trqsh logo" />

# trqsh

**Your localhost, live on the internet.** Expose local HTTP, TCP and UDP services through
an authenticated agent with QUIC-first transport and TCP fallback. Use the interactive
console or desktop app, inspect HTTP traffic locally, or self-host the full platform.

[![CI](https://github.com/trqsh-tunnel/trqsh/actions/workflows/ci.yml/badge.svg)](https://github.com/trqsh-tunnel/trqsh/actions/workflows/ci.yml)
[![Security](https://github.com/trqsh-tunnel/trqsh/actions/workflows/security.yml/badge.svg)](https://github.com/trqsh-tunnel/trqsh/actions/workflows/security.yml)
[![CodeQL](https://github.com/trqsh-tunnel/trqsh/actions/workflows/codeql.yml/badge.svg)](https://github.com/trqsh-tunnel/trqsh/actions/workflows/codeql.yml)
[![Go](https://img.shields.io/badge/Go-1.26%2B-00ADD8)](https://go.dev)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)

[CLI releases](https://github.com/trqsh-tunnel/trqshcli/releases) · [Documentation](docs/README.md) · [Self-hosting](docs/content/self-hosting.md) · [Contributing](CONTRIBUTING.md)

**Created and maintained by [Otabek Hamroqulov](https://github.com/Hamroqulovv)**

</div>

```text
# In your terminal: trqsh
# Inside its console:
/login
/http 3000
/ls
```

The console prints the actual assigned public URL. Keep your local HTTP app running on
port 3000. `/quit` leaves its background daemon and tunnels running; `/down` stops them.

## Why trqsh

- **QUIC-first transport**, with TLS-over-TCP + yamux fallback where UDP is blocked.
- **HTTP, TCP and UDP workflows**, subject to plan entitlements and edge networking.
- **Interactive console and desktop UI**, with local tunnel management and HTTP replay.
- **Reserved subdomains and verified custom domains** for stable HTTP endpoints.
- **Loopback agent API** for scripts and integrations; a separate cloud Control API.
- **Apache-2.0 source** for the agent, edge, control plane and web interfaces.

## Architecture

```text
 Developer machine            trqsh Cloud                        Public
 ┌──────────────┐   QUIC/TCP  ┌───────────────────────────┐    ┌─────────┐
 │ trqsh agent   │────mux──────▶│ edge (trqshd)             │◀───│ browser │
 │ localhost:3k │             │  ingress + vhost/SNI router│    │ *.trqsh.uz│
 │ inspector    │             │  registry (Redis)          │    └─────────┘
 └──────────────┘             │  ┌──────────────────────┐  │
                              │  │ control API (trqshapi)│──┼──▶ Postgres
                              │  │ auth · quotas · domains│  │   Redis
                              │  └──────────┬───────────┘  │
                              │     optional │ billing      │
                              └──────────────┴─────────────┘
```

- **agent** (`cmd/trqsh`) opens an authenticated, multiplexed session to its configured **edge**,
  registers tunnels, and forwards streams to local services.
- **edge** (`cmd/trqshd`) accepts public traffic, resolves subdomain/SNI → session via a Redis
  registry, and welds the two connections.
- **control plane** (`cmd/trqshapi`) owns identity, API keys, domains, quotas, and billing, and
  enforces entitlements at the edge on every bind.

## Quickstart

```bash
# macOS / Linux
curl -fsSL https://trqsh.uz/install.sh | sh
# Windows / macOS / Linux with npm
npm install -g @trqsh-uz/trqsh

trqsh --version
trqsh                # open the interactive console
```

Inside the console:

```text
/login               # approve the device code in your browser
/http 3000           # public HTTPS URL for a local HTTP app
/pin traffic         # watch completed HTTP exchanges
/stop all            # stop this agent's tunnels
/down                # stop the daemon and exit
```

The [documentation source index](docs/README.md) links all guides, including exact config,
commands, limitations, local automation and troubleshooting. The website serves them at
`/docs`; the Control API serves its own Swagger UI at `/docs` on the API origin.

**Uninstall:** `/uninstall` explains local-data removal; `/uninstall yes` stops the agent and
removes local config, credentials and cache. Remove the program with its original package
manager, for example `npm uninstall -g @trqsh-uz/trqsh` or `python -m pip uninstall trqsh`.

## Local development

Production domain layout and GitHub/Google-only sign-in: [deployment and OAuth setup](deploy/DOMAIN-AUTH.md).

Choose one local deployment mode; both use ports 80/443 and must not be started in parallel.

- **Single container:** [the `trqsh` stack](deploy/SINGLE-CONTAINER.md) exposes the site on `:3004`, dashboard on `:3005`, and API on `:8081`, all on loopback. Its public origins use `trqsh.uz`, `app.trqsh.uz`, and `api.trqsh.uz`; configure OAuth before starting it.
- **Separate services:** the persistent local stack below serves the site on `:3004`, dashboard on `:3005`, and API on `:8081`.

For the separate-service mode, including both frontends:

```bash
docker compose -p trqsh-local -f deploy/docker-compose.dev.yml -f deploy/docker-compose.local.yml --profile web up -d --build --wait
```

Website/docs: `http://localhost:3004`; dashboard: `http://localhost:3005`; API:
`http://localhost:8081`. PostgreSQL and Redis are internal to Docker. Agent transport
is on port 4443. See [development setup](docs/DEVELOPMENT.md) and [deployment guide](deploy/README.md)
for configurations, port conflicts and safe service-specific rebuilds.

```bash
make dev          # full local stack: postgres, redis, migrate, api, edge, mailhog
make build        # build all Go binaries
make test         # go test ./... -race
make lint         # golangci-lint
```

Run a public URL with **no cloud** (pure Go, in-memory registry + store):

```bash
TRQSH_ENTITLEMENTS=stub TRQSH_BASE_DOMAIN=lvh.me go run ./cmd/trqshd   # edge
TRQSH_API_KEY=local-dev-key go run ./cmd/trqsh --server 127.0.0.1:4443 --insecure http 3000
curl -H 'Host: <sub>.lvh.me' http://127.0.0.1
```

The arbitrary key above works only with development stub entitlements. Cloud account
commands require a real Control API; use the complete stack for those workflows.

Frontends: `make site` (:3002), `pnpm dev` in `web/dashboard` (:3000), and `pnpm tauri dev` in `desktop/` (the native Tauri app).

## Security

Public HTTPS terminates at the edge; the agent-edge transport is encrypted, while the
documented HTTP upstream is local plain HTTP. Other controls include argon2id-hashed
API keys, HMAC-pinned JWTs, constant-time comparisons, bounded protocol frames,
per-IP rate limiting, server timeouts, and a **fail-closed production config** (`TRQSH_ENV=production`
refuses to boot on dev-default secrets). CI runs gosec, govulncheck, CodeQL, and Trivy.

See **[SECURITY.md](./SECURITY.md)** for the full posture, the operator hardening checklist, and how
to report a vulnerability.

## Deployment

Everything to ship and scale lives in **[`deploy/`](./deploy/)**: multi-stage Dockerfiles,
`docker-compose` for the full local stack, a Helm chart (edge DaemonSet, API HPA/PDB, ingress,
migrate hook, NetworkPolicy), Terraform (DigitalOcean: DOKS + managed Postgres/Redis + per-region
edge droplets + wildcard DNS), and GitHub Actions for CI, images, and releases.

## Repository layout

```text
cmd/{trqshd,trqsh,trqshapi}        edge, agent/CLI, control-plane binaries
pkg/{proto,tunnel,authz}        shared frozen contracts (wire protocol, transport, entitlements)
internal/{server,agent,api,billing}   edge · agent core · control plane · billing
desktop/                        Tauri v2 desktop app (React UI over the bundled Go agent)
web/{dashboard,site}            Next.js dashboard + marketing site
deploy/                         docker, helm, terraform, CI/CD, observability, secrets
docs/                           engineering docs, API spec, build log
plan/                           architecture + build specs (frozen contracts)
```

## Contributing

See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for setup, standards, and the PR checklist, and
**[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)**.

## Author

trqsh is created and maintained by **Otabek Hamroqulov** — GitHub [@Hamroqulovv](https://github.com/Hamroqulovv).

## License

A future release is planned to use **GNU AGPLv3**, with commercial use allowed and Corresponding Source obligations for modified network-interactive covered versions. See the [licensing transition plan](docs/open-source/LICENSING.md). The transition is not effective until the license and release metadata are updated together.

The current source and published releases remain **open source** under **[Apache-2.0](./LICENSE)** — the whole stack: the agent/CLI, the
edge, the control plane, and billing. Run it as a service, self-host it, fork it, or build on it.

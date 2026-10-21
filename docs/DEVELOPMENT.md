# Development setup

Use the persistent local stack for end-to-end work, or run an individual component
natively while its dependencies are available. Commands below run from the repository
root unless a different directory is shown.

## Toolchains

| Tool | Required for | Version/source of truth |
| --- | --- | --- |
| Go | Native agent, edge, API and Go tests | 1.26+; go.mod is authoritative. |
| Node.js | Website/dashboard/desktop frontend | 20+; Docker uses 22 and current CI uses 24. |
| pnpm | Frontend dependency/build commands | Docker uses 9; current CI uses 10. Preserve the checked-in lockfile. |
| Docker + Compose | Full local stack and image builds | Compose 2.24.4+ for the overlay's !override syntax. |
| Rust / platform native tooling | Tauri desktop development | Stable toolchain compatible with desktop/src-tauri/Cargo.toml (rust-version 1.77). |

The full Docker workflow builds Go/Node components inside images. Host toolchains
are needed only for native development and host-side checks.

Optional generators include protoc/protoc-gen-go for proto/, goose for database
migrations and sqlc for typed database code. Use the versions/configuration used by
the repository's workflows when regenerating their outputs. golangci-lint v2 is used
by current Go CI. Stripe tooling is needed only when testing the optional billing
integration, not for normal tunnel/docs work.

Windows does not include make. Run the underlying commands directly in PowerShell,
or use a shell/environment with make available. POSIX environment assignments do
not work unchanged in PowerShell; use $env:VARIABLE instead.

## Persistent complete Docker stack

~~~sh
docker compose -p trqsh-local -f deploy/docker-compose.dev.yml -f deploy/docker-compose.local.yml --profile web up -d --build --wait
~~~

This uses the existing trqsh-local project and named PostgreSQL/Redis volumes.

| Service | Host address |
| --- | --- |
| Website/docs | http://localhost:3004 |
| Dashboard | http://localhost:3005 |
| Control API / Swagger | http://localhost:8081 / http://localhost:8081/docs |
| Agent transport | 127.0.0.1:4443 TCP and UDP |
| Edge HTTP/HTTPS | 127.0.0.1:80 / 127.0.0.1:443 |
| Edge health/metrics | http://localhost:9090 |
| Development mail UI | http://localhost:8025 |

Database ports are not published by this overlay. Local services bind to loopback.
Check port availability before starting the stack alongside other projects.

The migration service is a one-shot process: Exited (0) after schema migration is
normal. The remaining long-running services should be running/healthy.

## Use a host agent against Docker

Set both Control API and edge endpoints for the same local deployment:

~~~powershell
$env:TRQSH_CONFIG = "$env:USERPROFILE\.trqsh-local\trqsh.yml"
$env:TRQSH_API_URL = "http://localhost:8081"
$env:TRQSH_SERVER = "127.0.0.1:4443"
$env:TRQSH_INSECURE = "1"
go run ./cmd/trqsh
~~~

Inside the console, run /login and approve the local device in the local dashboard,
then /http 3000 after starting a host HTTP app. A key from the hosted service does
not authenticate to this independent local database.

The local base domain is lvh.me. Use the assigned host from /ls:

~~~sh
curl -H "Host: YOUR-ASSIGNED-SUBDOMAIN.lvh.me" http://127.0.0.1/
~~~

Development certificates are self-signed. The insecure setting is for this local
setup; use verified certificates for a production agent.

## Rebuild only the component you changed

For website/docs work:

~~~sh
docker compose -p trqsh-local -f deploy/docker-compose.dev.yml -f deploy/docker-compose.local.yml --profile web build site
docker compose -p trqsh-local -f deploy/docker-compose.dev.yml -f deploy/docker-compose.local.yml --profile web up -d --no-build --no-deps --wait site
~~~

For another existing service, replace site with its service name when appropriate.
Do not recreate unrelated services as a routine frontend update. If changing backend
schema/contracts, handle migrations and embedded assets explicitly.

Logs/status:

~~~sh
docker compose -p trqsh-local -f deploy/docker-compose.dev.yml -f deploy/docker-compose.local.yml --profile web ps
docker compose -p trqsh-local -f deploy/docker-compose.dev.yml -f deploy/docker-compose.local.yml --profile web logs --tail 100 api edge site
~~~

Stopping this project with the same command ending in down retains its named
volumes. down -v removes database data.

## Native website and dashboard

Run from each frontend directory:

~~~sh
pnpm install --frozen-lockfile
pnpm dev
~~~

The website's package scripts use port 3002; the dashboard uses 3000. The Docker
overlay's host ports 3004/3005 are distinct from those native defaults.

Build-time URLs must be set before dev/build if targeting a local API/dashboard.
For the website in PowerShell:

~~~powershell
$env:TRQSH_SITE_URL = "http://localhost:3002"
$env:TRQSH_DASHBOARD_URL = "http://localhost:3005"
$env:TRQSH_API_URL = "http://localhost:8081"
pnpm dev
~~~

Changes to build-time origins require a frontend rebuild for a production image.
Never assume switching environment variables reconfigures an already-built image.

## Native Go dependencies

The base development Compose file also offers a dependencies-only workflow:

~~~sh
docker compose -f deploy/docker-compose.dev.yml up -d postgres redis
~~~

It publishes PostgreSQL/Redis using the base file's ports, unlike the persistent
overlay. Check conflicts before using it. A native API needs a database URL,
migrations, Redis configuration and matching authentication/internal secrets.

For a quick development edge, the Makefile's run-edge target uses in-memory/stub
entitlements. That path is development-only and does not validate real cloud
ownership or plan rules. Prefer the complete stack when checking authentication,
domains, usage or quotas.

## Builds and checks

~~~sh
go build ./...
go test ./...
go vet ./...
~~~

Run the race detector where the platform/toolchain supports it:

~~~sh
go test ./... -race -count=1
~~~

In each changed frontend:

~~~sh
pnpm typecheck
pnpm build
~~~

The root Makefile exposes build, test, lint, proto, local and other workflow targets.
Read its command before invoking it. Go lint uses golangci-lint v2; frontend builds
perform their own TypeScript checks.

For user-guide changes, follow [Documentation maintenance](README.md): verify examples
against source, check internal links/anchors, keep OpenAPI copies in sync and inspect
both themes/mobile layouts.

## Desktop development

In desktop/:

~~~sh
pnpm install --frozen-lockfile
pnpm tauri dev
~~~

The native host uses a bundled Go agent binary. Follow desktop/README.md for sidecar
preparation and OS build dependencies; frontend-only pnpm dev does not provide the
native host APIs.

The desktop's control connection is fixed to 127.0.0.1:4041. Avoid conflicting agent
instances on that port. The console can use another control_addr for isolated work.

## Production and public-origin overlays

See [deploy/README.md](../deploy/README.md) and
[PRODUCTION.md](../deploy/PRODUCTION.md). The Cloudflare overlay changes public URLs
and dashboard base paths; it is not the same configuration as the localhost overlay.

Publishing an HTTP website origin does not publish QUIC/TCP agent transport, wildcard
HTTP tunnel ingress or allocated raw service ports. Validate those paths individually.

The Go module name is github.com/trqsh-uz/trqsh. Preserve it when building and
regenerating code; link-time metadata and generated import paths depend on it.

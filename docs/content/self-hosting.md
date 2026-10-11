# Self-hosting

Run the trqsh platform yourself: agent, edge, Control API, dashboard, website, PostgreSQL and Redis. This guide covers the repository's persistent local stack and the path to a production deployment.

Local stack addresses are examples for the supplied Compose overlay. They are not public tunnel URLs.

## Components and traffic

| Component | Role |
| --- | --- |
| Agent / console | Runs near your app and forwards tunnel traffic to it. |
| Edge | Accepts public ingress and encrypted agent connections. |
| Control API | Accounts, keys, reservations, domain verification, usage and entitlements. |
| Dashboard | Browser account management. |
| Website | Marketing pages and this documentation. |
| PostgreSQL | Persistent account/resource/usage records. |
| Redis | Shared edge/control-plane state. |

A working website login proves the HTTP control plane is reachable. It does not prove that the edge's QUIC/TCP port or allocated raw tunnel ports are reachable.

## Prerequisites

Use Docker with Compose **2.24.4 or later** for the overlay's `!override` support. Docker Desktop should be running on Windows/macOS. The persistent local workflow does not require a host Go or Node toolchain because images build those components.

For native development, use Go 1.25.8 or newer as required by `go.mod`, Node.js 20+ and pnpm 9. Check the repository development guide for optional generators.

## Start the full local stack

Clone the source repository shown on the website's source link, enter its root, then run:

~~~sh
docker compose -p trqsh-local -f deploy/docker-compose.dev.yml -f deploy/docker-compose.local.yml --profile web up -d --build --wait
~~~

Always use the same project name and both files for this stack. This reuses its existing named database volumes rather than creating an unrelated preview deployment.

Inspect status:

~~~sh
docker compose -p trqsh-local -f deploy/docker-compose.dev.yml -f deploy/docker-compose.local.yml --profile web ps
~~~

The migration service exits successfully after applying the schema; that is expected.

## Local addresses and ports

| Service | Host address |
| --- | --- |
| Website | `http://localhost:3004` |
| Dashboard | `http://localhost:3005` |
| Control API | `http://localhost:8081` |
| API Swagger UI | `http://localhost:8081/docs` |
| API health | `http://localhost:8081/healthz` |
| Edge HTTP / HTTPS ingress | `127.0.0.1:80` / `127.0.0.1:443` |
| Agent transport | `127.0.0.1:4443`, TCP and UDP |
| Edge metrics / health | `http://localhost:9090` |
| Development mail UI | `http://localhost:8025` |
| Development SMTP | `127.0.0.1:1025` |

PostgreSQL and Redis stay on the Docker network with **no published host ports** in the persistent overlay. The base development file alone has different port mappings; do not mix its addresses with this overlay's addresses.

The edge ports must be free before starting the stack. If another project uses them, change only this project's overlay and update the agent/advertised endpoints accordingly. TCP and UDP mappings are separate.

## Connect a host agent

The local edge uses development certificates. Set up a separate agent configuration:

~~~yaml
version: 1
server: "127.0.0.1:4443"
api_base: "http://localhost:8081"
transport: "auto"
region: "auto"
insecure: true
inspector:
  enabled: true
  addr: "127.0.0.1:4040"
control_addr: "127.0.0.1:4041"
~~~

Select that file with `TRQSH_CONFIG` before launching trqsh. Use `/login` to approve a local device using the local dashboard, or create a local dashboard API key and use `/login YOUR_LOCAL_KEY`.

Keys issued by the hosted service do not work with this independent local database.

Then start your host app and enter `/http 3000`. The assigned hostname uses the configured local base domain, `lvh.me`, which resolves to loopback. For a direct HTTP ingress check:

~~~sh
curl -H "Host: YOUR-ASSIGNED-SUBDOMAIN.lvh.me" http://127.0.0.1/
~~~

HTTPS uses a development certificate, so it is not publicly trusted. For local testing only, `curl -k https://YOUR-ASSIGNED-SUBDOMAIN.lvh.me/` skips that check.

## Container networking

The address in a tunnel is resolved **from the agent's environment**. An agent on the host can use `localhost:3000` for a host app. An agent in a container sees its own container as `localhost`; use an appropriate service name or Docker Desktop's `host.docker.internal` when targeting the host.

Raw TCP/UDP ports allocated inside an edge container also need explicit publication and firewall rules. The supplied local overlay primarily publishes HTTP ingress and agent transport; it does not publish every possible allocated service port.

## Rebuild only the website

For documentation or website changes, reuse the existing stack and rebuild only the site:

~~~sh
docker compose -p trqsh-local -f deploy/docker-compose.dev.yml -f deploy/docker-compose.local.yml --profile web build site
docker compose -p trqsh-local -f deploy/docker-compose.dev.yml -f deploy/docker-compose.local.yml --profile web up -d --no-build --no-deps --wait site
~~~

Frontend URLs are build-time settings. A local build points to ports 3004/3005/8081; a public-origin build must use its public URL overlay.

## Logs and stopping

~~~sh
docker compose -p trqsh-local -f deploy/docker-compose.dev.yml -f deploy/docker-compose.local.yml --profile web logs --tail 100 api edge site
docker compose -p trqsh-local -f deploy/docker-compose.dev.yml -f deploy/docker-compose.local.yml --profile web down
~~~

`down` stops this Compose project and retains its database volumes. Adding `-v` deletes those volumes; do not use it when you need to keep accounts/data.

## Public hosting

Use the repository's `deploy/PRODUCTION.md` for secrets, DNS, certificates, backups and production startup checks. Production requires real API entitlements, disabled development sign-in, strong secrets and correctly configured OAuth.

An HTTP reverse tunnel such as Cloudflare Tunnel can publish the website/dashboard/API. It does not automatically publish the agent's custom QUIC/TCP transport on 4443, wildcard tunnel ingress or dynamically allocated TCP/UDP ports. Those require separate network routing and DNS.

The supplied Cloudflare overlay also changes public dashboard paths and frontend origins. See `deploy/README.md` before switching an existing project between local and public URL modes.

## Operational limits

The current QR remote relay is held in one API process; a restart loses pairings, and multiple API replicas need appropriate routing/shared relay work. The dashboard cloud inspector is not yet a working capture archive.

For production details, use the deployment guide and validate each protocol separately rather than treating a successful website request as a full platform readiness check.

# Local platform in one `trqsh` container

From the repository root:

```powershell
docker compose -f deploy/docker-compose.single.yml up -d --build --wait --wait-timeout 180
```

The **single container named `trqsh`** runs the marketing/docs site, dashboard,
control API, edge, PostgreSQL 16 and Redis under Supervisor. Migrations run before
the API starts. Database data, Redis AOF, generated secrets, certificates and
pending usage survive container restarts/rebuilds in the `trqsh_trqsh_data` volume.
Internal database/API/metrics ports are not published. All host ports bind only
to `127.0.0.1`.

| Route | Local origin | Public URL after your Cloudflare connection |
| --- | --- | --- |
| Site and docs | `http://localhost:3004` | `https://tunnel.trqsh.uz` |
| Dashboard | `http://localhost:3004/dashboard` | `https://tunnel.trqsh.uz/dashboard` |
| Control API | `http://localhost:3004/v1` | `https://tunnel.trqsh.uz/v1` |
| Health | `http://localhost:3004/healthz` | `https://tunnel.trqsh.uz/healthz` |

Public navigation, canonical metadata, dashboard asset paths, OAuth callbacks and
device/QR links use `https://tunnel.trqsh.uz`. Site and dashboard assets are built
into the image; no host Node/Go installations are needed.

## Cloudflare Zero Trust

You manage the Cloudflare connector. For the hostname `tunnel.trqsh.uz`, use
service type **HTTP** and URL **localhost:3004** when cloudflared runs on Windows.
If your connector runs in another Docker container, use
`http://host.docker.internal:3004` instead; the loopback-only binding may need to
be adjusted for that topology. Do not point the HTTP connector at the edge's
agent port 4443.

The HTTP connector publishes the website/dashboard/API and the WebSocket agent
endpoint at `wss://tunnel.trqsh.uz/_trqsh/agent` (CLI 0.2.4+). The site forwards
that upgrade to the loopback-only edge listener on port 4445; API-key identity,
entitlements and the multiplexed wire protocol are unchanged. Direct QUIC/TCP
remains available at `127.0.0.1:4443` with development TLS. Tunnel ingress is on
ports 80/443, and TCP/UDP tunnel ports are 20000–20009.

The generated public HTTP tunnel URLs additionally need wildcard DNS, TLS and
Cloudflare ingress for `*.tunnel.trqsh.uz`, directed to the edge ingress (HTTP
port 80). Keep tenant ingress on separate hostnames from the control plane.

## Authentication

This is the repository's **local development mode**: email-only development
signup/login is enabled. Before giving public access, set `TRQSH_DEV_AUTH=0` in
`deploy/.env` and configure GitHub/Google OAuth credentials there. Callback URLs:
`https://tunnel.trqsh.uz/v1/auth/oauth/<provider>/callback`. Restart with the same
Compose `up -d` command. Cloudflare Access can also restrict who reaches this
development deployment.

## Operation

```powershell
docker compose -f deploy/docker-compose.single.yml ps
docker logs --tail 100 trqsh
docker exec trqsh supervisorctl status
docker compose -f deploy/docker-compose.single.yml restart
docker compose -f deploy/docker-compose.single.yml down
```

`down` keeps the data volume. Do not add `-v` unless you intend to erase it.

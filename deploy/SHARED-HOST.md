# Sharing one server with another project

trqsh can run on a host where another project already serves a hostname, for
example `stars.trqsh.uz` (f-bot). The edge owns the public ports, so tunnel
traffic has no extra proxy hop. The other project keeps its own TLS certificate:
the edge reads the SNI from the ClientHello and splices that TCP connection,
unterminated, to the other project's proxy.

```text
                       ┌────────────── host :80 / :443 / :4443 ─────────────┐
 *.trqsh.uz, apex ───► │ trqsh edge ── tunnels, site, app, api              │
 stars.trqsh.uz ─────► │   └─ SNI passthrough ─► f-bot-nginx:443 (own TLS)  │
   (via Cloudflare)    └──────────── shared-ingress network ────────────────┘
```

## Configuration

| Setting | Where | Example |
| --- | --- | --- |
| `TRQSH_TLS_PASSTHROUGH` | `deploy/.env` | `stars.trqsh.uz=f-bot-nginx:443?allow=cloudflare` |
| `TRQSH_RESERVED_SUBDOMAINS` | `deploy/.env` (read by the edge and the API) | `stars` |
| `docker-compose.shared-host.yml` | compose overlay | puts the edge on `shared-ingress` at `172.31.250.10` |

Passthrough options:

- `allow=cloudflare,<cidr>` admits only those client source ranges. Use
  `cloudflare` for a proxied hostname. The backend can then trust the edge's
  fixed address for `CF-Connecting-IP`.
- `proxy=v1` sends a PROXY protocol v1 header first, for a backend without
  Cloudflare in front.

Plain HTTP for a passthrough host receives a redirect to HTTPS. The edge never
issues a certificate for it. The edge refuses to start if a passthrough host is
a control-plane host, or if a host under the base domain is missing from
`TRQSH_RESERVED_SUBDOMAINS`.

## DNS (Cloudflare)

| Record | Proxy | Target |
| --- | --- | --- |
| `trqsh.uz` A | DNS only | server IP |
| `*.trqsh.uz` A | DNS only | server IP |
| `stars.trqsh.uz` A | Proxied | server IP (unchanged) |

Remove older `trqsh.uz`, `app`, `api` and `www` records that point at a
Cloudflare Tunnel. The wildcard then covers them. The edge obtains
`*.trqsh.uz` via DNS-01, so set `TRQSH_CLOUDFLARE_API_TOKEN`.

## Cutover on a host where the other project owns 80/443

1. Create the network once: `docker network create --subnet 172.31.250.0/24 shared-ingress`.
2. Prepare trqsh without the edge:
   `docker compose -f docker-compose.prod.yml -f docker-compose.shared-host.yml up -d postgres redis migrate api site dashboard backup`.
   The edge image must be a release that contains TLS passthrough.
3. Switch the other project's proxy off the public ports (for f-bot:
   `echo shared-edge > /etc/f-bot/ingress-mode`, then its deploy). Its site is
   unavailable from this point.
4. Start the edge: `docker compose -f docker-compose.prod.yml -f docker-compose.shared-host.yml up -d edge`.
   The site is reachable again through passthrough.
5. Open the agent ports: `ufw allow 443/udp`, `ufw allow 4443/tcp`, `ufw allow 4443/udp`.

## Moving the other project away later

1. Bring it up on its new server and point its DNS record there.
2. Clear `TRQSH_TLS_PASSTHROUGH` in `deploy/.env` and keep its name in
   `TRQSH_RESERVED_SUBDOMAINS`, so no tunnel can take it over.
3. Redeploy the edge without `docker-compose.shared-host.yml`.

If trqsh moves away instead, the other project reverses step 3 of the cutover
(for f-bot, remove `/etc/f-bot/ingress-mode`) and publishes 80/443 itself again.

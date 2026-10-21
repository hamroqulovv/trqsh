# Single-container platform

The complete image runs the site, dashboard, API, edge, PostgreSQL and Redis as
the unprivileged `app` user (UID 10001). Data and generated credentials persist
in the existing `trqsh_trqsh_data` volume. No volume is recreated by a rebuild.

Production deployment on the new server uses the separate-service configuration
in [DOMAIN-AUTH.md](DOMAIN-AUTH.md). The single-container option uses the same
public hostnames and GitHub/Google-only sign-in:

| Surface | Loopback inspection URL | Public origin |
| --- | --- | --- |
| Site/docs | `http://localhost:3004` | `https://trqsh.uz` |
| Dashboard | `http://localhost:3005` | `https://app.trqsh.uz` |
| API | `http://localhost:8081` | `https://api.trqsh.uz` |
| Tunnel ingress | ports 80/443 | `*.trqsh.uz` |
| Direct agent | port 4443 TCP/UDP | `trqsh.uz:4443` |

All published host ports bind to 127.0.0.1. Database and metrics ports remain
internal. A production reverse proxy must route each public hostname to its
intended service. The `/dashboard` mount and `tunnel.trqsh.uz` are no longer
the defaults. Build-time public origins can be overridden using
`TRQSH_SITE_URL`, `TRQSH_APP_URL`, `TRQSH_API_PUBLIC_URL` and `TRQSH_BASE_DOMAIN`.
Rebuild after changing them. Merely opening a loopback page does not change its
public links or register localhost OAuth callbacks.

Configure both OAuth applications in `deploy/.env` before running:

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.single.yml up -d --build --wait --wait-timeout 180
```

Production is the default environment. Email-only authentication is disabled,
and the API refuses to start with no configured OAuth provider. The exact
callback URLs and account migration requirements are in [DOMAIN-AUTH.md](DOMAIN-AUTH.md).
The existing runtime volume and running containers are not changed by this PR.

## Operation

```powershell
docker compose -f deploy/docker-compose.single.yml ps
docker logs --tail 100 trqsh
docker exec trqsh supervisorctl status
docker compose -f deploy/docker-compose.single.yml restart
docker compose -f deploy/docker-compose.single.yml down
```

`down` keeps the data volume. Do not add `-v` unless you intend to erase it.

## Upgrading an existing volume

The first image used separate service users and a root supervisor. When
upgrading that image to the non-root image, migrate file ownership once while
the services are stopped. Database contents, Redis data and runtime secrets
stay in the existing volume:

```powershell
docker compose -f deploy/docker-compose.single.yml build trqsh
docker compose -f deploy/docker-compose.single.yml stop trqsh
docker compose -f deploy/docker-compose.single.yml run --rm --no-deps --user 0 trqsh --prepare-data
docker compose -f deploy/docker-compose.single.yml up -d --wait --wait-timeout 180
```

Only the explicit preparation command runs as root to change volume ownership.
Normal startup uses UID 10001. Fresh volumes need no preparation command.

## Local UI preview

Without OAuth applications, use the explicit local overlay:

```powershell
docker compose -f deploy/docker-compose.single.yml -f deploy/docker-compose.single.local.yml up -d --build --wait --wait-timeout 240
```

Open the site at `http://localhost:3004`, dashboard at
`http://localhost:3005`, and API health at `http://localhost:8081/healthz`.
The public production domain defaults stay in the base configuration. The local
overlay uses loopback URLs and `lvh.me` tunnel examples, disables email-only
login, and leaves OAuth sign-in unavailable until real local OAuth applications
are configured. Latest-release download links keep the existing published
version until the prepared 0.2.6 package is actually released.

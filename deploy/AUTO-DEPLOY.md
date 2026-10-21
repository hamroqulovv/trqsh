# Automatic production deploys

Every push to `main` builds images (`.github/workflows/images.yml`). When that
run succeeds, `.github/workflows/deploy.yml` connects to the host over SSH. The
CI key can run only the forced command `deploy <full SHA>`.

```text
push main ─► Images (GHCR sha-xxxxxxx) ─► Deploy ─ssh─► trqsh-deploy-gateway ─► deploy/scripts/deploy-vps.sh
```

The host deploys only the commit that is currently `main` (exit 76 means a newer
commit superseded it). It also stays passive until
`/etc/trqsh/deployment-enabled` exists (exit 75). Both outcomes show as notices,
not failures. The job's `GITHUB_TOKEN` is piped to the host to pull images
from the private GHCR packages, and is never stored on the host.

## What a deploy does

1. Checks out the SHA in `/opt/trqsh`. `deploy/.env` is untracked and kept.
2. Pulls `sha-<short>` images, runs migrations, then updates api, site,
   dashboard and backup.
3. Recreates the edge **only** when a path in `deploy/scripts/edge-paths`
   changed. Otherwise live tunnels stay connected. CI fails the deploy if that
   list misses a package linked into `trqshd`.
4. Checks `https://api.<base>/healthz` through the local edge, then records
   the result in `/etc/trqsh/deployed-commit` and `/etc/trqsh/images.env`.

## Host setup (done once)

| Item | Value |
| --- | --- |
| Checkout | `/opt/trqsh` (public clone of `trqsh-tunnel/trqsh`) |
| Gateway | `/usr/local/sbin/trqsh-deploy-gateway` (from `deploy/scripts/deploy-gateway.sh`) |
| CI key | `/root/.ssh/authorized_keys`: `restrict,command="/usr/local/sbin/trqsh-deploy-gateway"` |
| Shared host | `touch /etc/trqsh/shared-host` to add `docker-compose.shared-host.yml` |
| Repository secrets | `TRQSH_DEPLOY_HOST`, `TRQSH_DEPLOY_SSH_KEY`, `TRQSH_DEPLOY_KNOWN_HOSTS` |

Enable CI deploys after the first manual deploy succeeds (`deploy/.env`, DNS,
TLS, and [SHARED-HOST.md](SHARED-HOST.md) when the host is shared):

```bash
touch /etc/trqsh/deployment-enabled
```

## Manual commands on the host

Use the tags that are actually running, so Compose does not recreate the edge:

```bash
cd /opt/trqsh/deploy
docker compose --env-file .env --env-file /etc/trqsh/images.env -f docker-compose.prod.yml -f docker-compose.shared-host.yml ps
```

To redeploy the current `main`, run the **Deploy** workflow manually
(workflow_dispatch). To roll back, revert the commit on `main`.

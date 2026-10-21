#!/bin/bash
# Deploy one tested main SHA from GHCR. Run by deploy-gateway.sh as root; the
# GHCR read token for this run is read from stdin and never written to disk.
#
# Host state (outside the repo):
#   /opt/trqsh/deploy/.env        production settings (gitignored)
#   /etc/trqsh/deployment-enabled CI may deploy
#   /etc/trqsh/shared-host        add docker-compose.shared-host.yml (SHARED-HOST.md)
#   /etc/trqsh/images.env         image tags currently running, written here
set -euo pipefail
umask 077

main() {
  local revision=${1:-} root=/opt/trqsh state=/etc/trqsh previous edge_tag base
  [[ $revision =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected a full commit SHA' >&2; return 2; }
  [[ $(id -u) == 0 ]] || { echo 'Run through the deployment gateway' >&2; return 2; }
  exec 9>/run/lock/trqsh-deploy.lock
  flock -n 9 || { echo 'Another deployment is running' >&2; return 4; }
  cd "$root"
  [[ -s deploy/.env ]] || { echo 'deploy/.env is missing' >&2; return 3; }
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo 'Tracked server files have local changes; refusing to overwrite them' >&2
    return 5
  fi
  previous=$(cat "$state/deployed-commit" 2>/dev/null || true)
  git checkout -q --detach "$revision"
  cd deploy

  export COMPOSE_PROJECT_NAME=trqsh COMPOSE_FILE=docker-compose.prod.yml
  [[ ! -f $state/shared-host ]] || COMPOSE_FILE+=:docker-compose.shared-host.yml
  export TRQSH_IMAGE_TAG=sha-${revision:0:7}
  # The edge holds every live tunnel: keep its running image unless its code or
  # compose config changed (scripts/edge-paths, checked in CI against go list).
  edge_tag=$(sed -n 's/^TRQSH_EDGE_IMAGE_TAG=//p' "$state/images.env" 2>/dev/null || true)
  mapfile -t edge_paths < scripts/edge-paths
  if [[ -z $edge_tag || -z $previous ]] ||
    ! git -C "$root" diff --quiet "$previous" "$revision" -- "${edge_paths[@]}"; then
    edge_tag=$TRQSH_IMAGE_TAG
  fi
  export TRQSH_EDGE_IMAGE_TAG=$edge_tag

  DOCKER_CONFIG=$(mktemp -d)
  export DOCKER_CONFIG
  trap 'rm -rf "$DOCKER_CONFIG"' EXIT
  docker login ghcr.io --username trqsh-deploy --password-stdin >/dev/null

  docker compose config -q
  docker compose pull --quiet migrate api site dashboard edge
  docker compose up -d --wait postgres redis
  docker compose run --rm --no-deps migrate
  docker compose up -d --no-deps --wait api site dashboard backup
  docker compose run --rm --no-deps edge-init
  # A no-op unless the edge's image tag or configuration changed.
  docker compose up -d --no-deps --wait edge

  base=$(sed -n 's/^TRQSH_BASE_DOMAIN=//p' .env | tail -n 1)
  base=${base:-trqsh.uz}
  # Through the local edge: proves routing, not certificate trust (staging certs).
  curl --fail --silent --show-error --insecure --max-time 15 --retry 10 --retry-delay 3 \
    --retry-all-errors --resolve "api.$base:443:127.0.0.1" "https://api.$base/healthz" >/dev/null

  printf 'TRQSH_IMAGE_TAG=%s\nTRQSH_EDGE_IMAGE_TAG=%s\n' "$TRQSH_IMAGE_TAG" "$edge_tag" > "$state/images.env"
  printf '%s\n' "$revision" > "$state/deployed-commit"
  echo "Deployed $revision (edge image $edge_tag)"
  docker compose ps --format '{{.Service}} {{.State}} {{.Health}}'
}

main "$@"

#!/bin/bash
# Install root:root 0755 as /usr/local/sbin/trqsh-deploy-gateway. The CI key in
# /root/.ssh/authorized_keys may run only this:
#   restrict,command="/usr/local/sbin/trqsh-deploy-gateway" ssh-ed25519 AAAA... trqsh-github-deploy
# The GHCR read token for the run arrives on stdin and is passed through.
set -euo pipefail
[[ ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([0-9a-f]{40})$ ]] || {
  echo 'Only "deploy <full commit SHA>" is permitted' >&2
  exit 64
}
revision=${BASH_REMATCH[1]}
umask 077
# Until the first manual deploy is complete (deploy/.env, DNS, TLS), CI only reports.
[[ -f /etc/trqsh/deployment-enabled ]] || {
  echo 'trqsh deployment is not enabled on this host yet' >&2
  exit 75
}
git -C /opt/trqsh fetch -q --no-tags origin main
[[ $(git -C /opt/trqsh rev-parse origin/main) == "$revision" ]] || {
  echo 'Superseded: the requested commit is no longer main' >&2
  exit 76
}
# Run the requested revision's own deployment logic. Reading a Git blob leaves
# the checkout and the running containers unchanged until it starts.
runner=$(mktemp /run/trqsh-deploy.XXXXXXXX.sh)
trap 'rm -f "$runner"' EXIT
git -C /opt/trqsh show "$revision:deploy/scripts/deploy-vps.sh" > "$runner"
/bin/bash "$runner" "$revision"

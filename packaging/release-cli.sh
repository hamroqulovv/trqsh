#!/usr/bin/env bash
# CLI archives only: no edge, desktop, image, or system-package release.
set -Eeuo pipefail
release_version="${GITHUB_REF_NAME#package-v}"
if [[ ! "$release_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    printf 'Expected a package-vX.Y.Z release tag\n' >&2
    exit 1
fi
release_commit="$(git rev-parse --short HEAD)"
release_date="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
release_stage="$(mktemp -d)"
mkdir -p dist
for release_os in linux darwin windows; do
    for release_arch in amd64 arm64; do
        release_target="${release_stage}/${release_os}-${release_arch}"
        mkdir -p "$release_target"
        release_binary=trqsh
        if [ "$release_os" = windows ]; then release_binary=trqsh.exe; fi
        printf 'Building CLI %s/%s v%s\n' "$release_os" "$release_arch" "$release_version"
        CGO_ENABLED=0 GOOS="$release_os" GOARCH="$release_arch" go build -trimpath \
            -ldflags "-s -w -X github.com/trqsh-uz/trqsh/internal/agent.Version=${release_version} -X github.com/trqsh-uz/trqsh/internal/agent.Commit=${release_commit} -X github.com/trqsh-uz/trqsh/internal/agent.BuildDate=${release_date}" \
            -o "${release_target}/${release_binary}" ./cmd/trqsh
        cp LICENSE README.md "$release_target/"
        release_archive="trqsh_${release_version}_${release_os}_${release_arch}"
        if [ "$release_os" = windows ]; then
            (cd "$release_target" && zip -q "$GITHUB_WORKSPACE/dist/${release_archive}.zip" "$release_binary" LICENSE README.md)
        else
            tar -czf "dist/${release_archive}.tar.gz" -C "$release_target" "$release_binary" LICENSE README.md
        fi
    done
done
(cd dist && sha256sum trqsh_*.tar.gz trqsh_*.zip > checksums.txt)

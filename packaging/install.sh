#!/bin/sh
# trqsh installer — detects your OS/arch, downloads the signed release binary,
# verifies its checksum, and installs it. Serve this at https://trqsh.uz/install.sh:
#
#   curl -fsSL https://trqsh.uz/install.sh | sh
#
# Overrides: TRQSH_VERSION, TRQSH_REPO, TRQSH_BINDIR.
set -eu

# CLI releases publish to their own dedicated repo (source stays in
# algorithco/trqsh; see .goreleaser.yaml).
REPO="${TRQSH_REPO:-algorithco/trqshcli}"
BINDIR="${TRQSH_BINDIR:-}"

say() { printf '  [ok] %s\n' "$1" >&2; }
die() { printf '  [x] %s\n' "$1" >&2; exit 1; }
printf '\n  trqsh / install\n  Localhost, online.\n\n' >&2

resolve_latest_version() {
  # The dedicated CLI repo's latest endpoint excludes prereleases/drafts.
  url="https://api.github.com/repos/${REPO}/releases/latest"
  if command -v curl >/dev/null 2>&1; then
    body=$(curl -fsSL --connect-timeout 15 --max-time 60 "$url" 2>/dev/null) || return 0
  elif command -v wget >/dev/null 2>&1; then
    body=$(wget --timeout=30 --tries=2 -qO- "$url" 2>/dev/null) || return 0
  else
    return 0
  fi
  printf '%s' "$body" \
    | grep -o '"tag_name": *"v[0-9][^"]*"' \
    | sed -E 's/.*"v([0-9][^"]*)"/\1/' \
    | head -n1
}

VERSION="${TRQSH_VERSION:-}"
if [ -z "$VERSION" ]; then
  VERSION=$(resolve_latest_version)
  if [ -z "$VERSION" ]; then
    die 'Could not resolve latest release. Retry or set TRQSH_VERSION.'
  fi
fi

VERSION=${VERSION#v}
case "$VERSION" in ''|*[!0-9A-Za-z.+-]*) die 'Invalid TRQSH_VERSION.' ;; esac

os=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$os" in
  linux) goos=linux ;;
  darwin) goos=darwin ;;
  *) die "unsupported OS '$os' — see https://github.com/$REPO/releases" ;;
esac

arch=$(uname -m)
case "$arch" in
  x86_64 | amd64) goarch=amd64 ;;
  arm64 | aarch64) goarch=arm64 ;;
  *) die "unsupported architecture '$arch'" ;;
esac

say "Platform  $goos / $goarch"
say "Release  v$VERSION"
archive="trqsh_${VERSION}_${goos}_${goarch}.tar.gz"
base="${TRQSH_DOWNLOAD_BASE:-https://github.com/${REPO}/releases/download/v${VERSION}}"

tmp=$(mktemp -d 2>/dev/null || mktemp -d -t trqsh)
staged=''
cleanup() { [ -z "$staged" ] || rm -f "$staged"; rm -rf "$tmp"; }
trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' TERM

download() {
  # download <url> <dest>
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --connect-timeout 15 --max-time 300 "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget --timeout=30 --tries=2 -qO "$2" "$1"
  else
    die "need curl or wget to download"
  fi
}

printf '  [..] Downloading  %s\n' "$archive" >&2
download "${base}/${archive}" "${tmp}/${archive}" || die 'Download failed. Retry installation.'
say "Downloaded  $(wc -c < "$tmp/$archive" | tr -d ' ') bytes"

if [ "${TRQSH_SKIP_CHECKSUM:-0}" = "1" ]; then
  printf '  [!] Verification skipped  TRQSH_SKIP_CHECKSUM=1\n' >&2
else
  download "${base}/checksums.txt" "${tmp}/checksums.txt" || die 'Could not fetch checksums.txt.'
  want=$(awk -v file="$archive" '{ name=$2; sub(/^\*/, "", name); if (name == file) {print tolower($1); exit} }' "$tmp/checksums.txt")
  [ -n "$want" ] || die 'Archive missing from checksums.txt.'
  if command -v sha256sum >/dev/null 2>&1; then
    got=$(sha256sum "$tmp/$archive" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then
    got=$(shasum -a 256 "$tmp/$archive" | awk '{print $1}')
  else
    die 'Need sha256sum or shasum to verify the download.'
  fi
  [ "$want" = "$got" ] || die "Checksum mismatch for $archive"
  say 'Verified  SHA-256'
fi

printf '  [..] Installing  Native CLI\n' >&2
tar -xzf "${tmp}/${archive}" -C "${tmp}" || die 'Could not extract archive.'
[ -f "${tmp}/trqsh" ] || die "trqsh binary missing from archive"
[ ! -L "$tmp/trqsh" ] || die 'Expected a regular binary.'
chmod 0755 "$tmp/trqsh"
actual=$("$tmp/trqsh" --version) || die 'Downloaded binary could not run.'
reported=$(printf '%s\n' "$actual" | awk '$1 == "trqsh" {sub(/^v/, "", $2); print $2; exit}')
[ "$reported" = "$VERSION" ] || die 'Downloaded binary version does not match release.'

# Choose an install dir on PATH that we can write to.
if [ -z "$BINDIR" ]; then
  if [ -w /usr/local/bin ] 2>/dev/null; then
    BINDIR=/usr/local/bin
  else
    BINDIR="${HOME}/.local/bin"
  fi
fi
mkdir -p "$BINDIR"

staged=$(mktemp "$BINDIR/.trqsh-install.XXXXXX") || die 'Install directory is not writable.'
cp "$tmp/trqsh" "$staged" && chmod 0755 "$staged" || die 'Could not stage binary.'
mv -f "$staged" "$BINDIR/trqsh" || die 'Could not replace binary.'
staged=''

say "installed to ${BINDIR}/trqsh"
case ":${PATH}:" in
  *":${BINDIR}:"*) ;;
  *) say "add ${BINDIR} to your PATH to run 'trqsh' from anywhere" ;;
esac
printf '\n  Installed successfully. Run: trqsh\n\n' >&2

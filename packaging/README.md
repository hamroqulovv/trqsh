![trqsh — Localhost, online.](assets/readme-banner.svg)

# trqsh · Distribution

**One native CLI. Familiar installation tools.**

This directory contains npm and Python launchers, the shell installer and Windows package manifests. [GoReleaser](../.goreleaser.yaml) builds native CLI assets; the [desktop app](../desktop/README.md) has a separate release workflow.

[Channels](#packages-and-channels) · [Installation](#installation-flow) · [Verification](#release-verification) · [Checks](#maintainer-checks) · [Releasing](#releasing)

## Packages and channels

| Channel | Guide | Status in this checkout |
| --- | --- | --- |
| npm · `@trqsh-uz/trqsh` | [npm](npm/README.md) | Install hook and lazy-download fallback. |
| PyPI · `trqsh` | [Python](pypi/README.md) | Standard-library wrapper; binary downloads on first use. |
| Shell | [Installer](install.sh) | macOS/Linux installer, mirrored in the website's public directory. |
| Scoop | [Manifest guide](scoop/README.md) | Existing manifest pins a legacy version and repository; refresh before release. |
| winget | [Manifest guide](winget/README.md) | Template manifests contain placeholder checksums. |
| Homebrew | [Release configuration](../.goreleaser.yaml) | Tap publishing is currently commented out. |
| Debian / RPM | [Release configuration](../.goreleaser.yaml) | Configured to package the CLI and edge server together. |

Manifest presence does not establish availability in a public package catalog.

## Quick start

**npm**

```sh
npm install -g @trqsh-uz/trqsh --foreground-scripts
trqsh
```

**Python**

```sh
pipx install trqsh
trqsh
```

**macOS / Linux shell**

```sh
curl -fsSL https://trqsh.uz/install.sh -o trqsh-install.sh
sh trqsh-install.sh
trqsh
```

The shell installer selects a writable binary directory and prints PATH guidance when needed. Set `TRQSH_BINDIR` to choose a destination.

## Installation flow

```text
Platform → Release → Download → SHA-256 → Install → Ready
                                                   │
                                      first interactive launch
                                                   │
                                    Welcome → Sign in → Console
```

npm and Python show measured byte progress in suitable terminals. Shell reports stages and completed download size. Redirected output stays plain, and package hooks never prompt for credentials.

The native CLI supplies the shared welcome guide for fresh configurations. Reopen it with `trqsh setup` or `/setup`. Existing configurations, explicit startup commands, help and version checks bypass automatic onboarding. Setup preferences are stored beside the selected config in a separate file keyed by its absolute path.

## Release assets

npm, Python and shell default to **`algorithco/trqshcli`**:

```text
trqsh_<version>_<os>_<arch>.tar.gz   macOS / Linux
trqsh_<version>_windows_<arch>.zip  Windows
checksums.txt                     SHA-256 manifest
checksums.txt.sigstore.json        Release-origin verification bundle
```

Native targets are `darwin`, `linux` and `windows`, on `amd64` and `arm64`. Source remains in the main repository. Wrapper versions select matching native releases unless explicitly overridden.

## Release verification

Wrappers compare each downloaded archive with `checksums.txt` before installation. Missing or mismatched checksums fail by default. Downloads and extraction are staged before replacing a usable binary.

The release configuration signs the checksum manifest with cosign. Download the manifest and its bundle, then verify its origin:

```bash
cosign verify-blob \
  --bundle checksums.txt.sigstore.json \
  --certificate-identity-regexp '^https://github[.]com/(uzcreator|algorithco)/trqsh/[.]github/workflows/release[.]yml@refs/tags/v[^/]+$' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  checksums.txt
```

Archive SHA-256 verification and signature-origin verification are separate operations.

## Overrides

| Variable | Applies to | Purpose |
| --- | --- | --- |
| `TRQSH_VERSION` | npm, Python, shell | Pin a native release. |
| `TRQSH_REPO` | npm, Python, shell | Select another release repository. |
| `TRQSH_DOWNLOAD_BASE` | npm, Python, shell | Use a release-asset mirror. |
| `TRQSH_SKIP_CHECKSUM=1` | npm, Python, shell | Explicitly skip checksum verification, with a warning. |
| `TRQSH_BINDIR` | Shell | Choose an installation directory. |
| `XDG_CACHE_HOME` | Python | Choose the parent of the binary cache. |

## Maintainer checks

Run from the repository root:

```sh
node --test packaging/npm/test/install.test.js
python -m unittest discover -s packaging/pypi -p 'test_*.py'
python packaging/test_shell_install.py
go test ./internal/agent/cli/...
sh -n packaging/install.sh
```

The Node test runner requires Node 18 or later. Shell fixtures require Bash and standard archive/checksum tools. These checks use local fixtures and do not publish packages.

From `packaging/npm`, inspect the package payload:

```sh
npm pack --dry-run --ignore-scripts
```

From `packaging/pypi`, with build and twine installed:

```sh
python -m build
python -m twine check dist/*
```

Keep [install.sh](install.sh) and [the website copy](../web/site/public/install.sh) byte-for-byte identical. Public package READMEs use absolute image URLs; publish referenced assets before publishing the package metadata.

## Releasing

1. Publish and verify native CLI assets through [release.yml](../.github/workflows/release.yml). Cross-repository publishing uses `RELEASE_REPO_TOKEN`.
2. Align `npm/package.json`, `pypi/pyproject.toml` and `pypi/src/trqsh/__init__.py` with the native release version.
3. Run the checks above and smoke-test target platforms.
4. Publish through [npm-publish](../.github/workflows/npm-publish.yml) or [pypi-publish](../.github/workflows/pypi-publish.yml), supplying the matching release version. These workflows use `NPM_TOKEN` and `PYPI_TOKEN`.
5. Refresh Windows manifests with the published archive URLs and exact hashes, then follow the channel guides before catalog submission.

Homebrew needs its release configuration, tap and credentials completed before being advertised as available. Desktop publishing follows its own workflow.

---

[Project overview](../README.md) · [Installation docs](../docs/content/installation.md) · [Contributing](../CONTRIBUTING.md)

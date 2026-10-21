![trqsh — Localhost, online.](https://raw.githubusercontent.com/trqsh-tunnel/trqsh/main/packaging/assets/readme-banner.svg)

# trqsh · Python

**Public URLs for local development. Installed with pip or pipx.**

Share development servers, receive webhooks and inspect traffic from an interactive terminal. This package installs the native CLI; the desktop app is a separate download.

CLI 0.2.6 uses `https://api.trqsh.uz` for sign-in and account APIs and
connects to `trqsh.uz:4443` with QUIC and TCP fallback. Public tunnel URLs use
`*.trqsh.uz` and require wildcard DNS/TLS plus edge ingress. This version is a
release candidate in source; publish its native assets and wrappers together
after the new deployment is ready.

[![PyPI](https://img.shields.io/pypi/v/trqsh?style=flat-square&color=18181b)](https://pypi.org/project/trqsh/)
[![Python](https://img.shields.io/badge/Python-%3E%3D3.8-52525b?style=flat-square)](#requirements)
[![License](https://img.shields.io/badge/license-Apache--2.0-52525b?style=flat-square)](https://github.com/trqsh-tunnel/trqsh/blob/main/LICENSE)

[Quick start](#quick-start) · [First launch](#first-launch) · [Commands](#everyday-commands) · [Configuration](#configuration) · [Troubleshooting](#troubleshooting)

---

## Quick start

Install into an isolated environment with pipx:

```sh
pipx install trqsh
trqsh --version
trqsh
```

Or install with your Python environment:

```sh
python -m pip install trqsh
python -m trqsh --version
python -m trqsh
```

The native CLI downloads **on first use**, including the first version check. Installing the Python package itself does not open the setup guide. Once signed in, use `trqsh http 3000` to start a local web tunnel.

### Requirements

| Requirement | Supported |
| --- | --- |
| Runtime | Python 3.8 or later |
| Package manager | pip, or an existing pipx installation |
| Operating system | Windows, macOS, Linux |
| Architecture | x64 / amd64, arm64 |
| Network | Package index and native CLI release assets |
| Console | Interactive terminal for setup and tunnel commands |

The launcher uses the Python standard library and has no third-party runtime dependencies.

## First launch

Run `trqsh` in an interactive terminal. On a fresh configuration, the welcome guide offers browser sign-in, a masked API-key field, or **Set up later**. After signing in, choose a local HTTP port to expose or open the console.

```text
trqsh / welcome
Bring your localhost online.

> Sign in with browser
  Use an API key
  Set up later
```

*Illustrative welcome screen. Appearance adapts to your terminal.*

Reopen the guide with `trqsh setup` or `/setup` inside the console. Existing configurations and explicit commands such as `trqsh http 3000` keep their normal startup behavior. A tunnel starts only after you request it.

## Everyday commands

Enter these commands **inside the trqsh console**:

| Task | Command |
| --- | --- |
| Open the setup guide | `/setup` |
| Sign in through your browser | `/login` |
| Expose a local web server | `/http 3000` |
| Forward TCP or UDP traffic | `/tcp 5432` · `/udp 19132` |
| List tunnels and copy a URL | `/ls` · `/copy` |
| Inspect captured requests | `/requests` |
| Keep traffic visible | `/pin traffic` |
| Pair the console with your phone | `/qr` |
| Inspect account and connection | `/whoami` · `/status` |
| Choose a terminal theme | `/theme auto` · `/theme dark` · `/theme light` |
| Stop tunnels | `/stop <id>` · `/stop all` |
| Stop the daemon and exit | `/down` |
| Discover all commands | `/help` |

Protocol access, reserved subdomains and custom domains depend on the service configuration and your account's entitlements. Closing the console alone does not stop the background daemon.

## Installation experience

```text
trqsh / install
Localhost, online.

[ok] Platform    windows / amd64
[ok] Release     vX.Y.Z
[..] Downloading 6.4 / 12.8 MB
```

*Illustrative progress output. Actual releases and byte counts are shown during installation.*

The wrapper detects your platform, downloads the native archive, verifies SHA-256, stages the binary and reports its location. Suitable terminals show measured byte progress; CI and redirected output receive plain lines. Package installation never asks for credentials or starts a tunnel.

Missing or mismatched checksums stop installation by default. Interrupted downloads and extraction leave an existing binary intact. Archive integrity and release-origin verification are separate: see the [Sigstore verification instructions](https://github.com/trqsh-tunnel/trqsh/blob/main/packaging/README.md#release-verification) for the latter.

## Configuration

| Variable | Behavior |
| --- | --- |
| `TRQSH_VERSION` | Pin a native release; otherwise the package version selects the initial download. |
| `TRQSH_REPO` | Override the release repository; default: `trqsh-tunnel/trqshcli`. |
| `TRQSH_DOWNLOAD_BASE` | Base URL of a mirror containing the archive and `checksums.txt`. |
| `NO_COLOR` / `TRQSH_NO_COLOR` | Disable animated installer output when set to a nonempty value. |
| `TRQSH_SKIP_CHECKSUM=1` | Explicitly bypass integrity verification; prints a verification-skipped warning. |

Agent settings use `~/.trqsh/trqsh.yml` by default. Select another file with `trqsh --config PATH` or `TRQSH_CONFIG`. See the [configuration guide](https://trqsh.uz/docs/configuration).

## Update

Use the package manager you installed with:

```sh
# pipx
pipx upgrade trqsh

# pip
python -m pip install --upgrade trqsh
```

The console also supports `/update check` and `/update`. Restart after a successful update. Cached binaries older than the package are replaced; newer self-updates are retained unless `TRQSH_VERSION` explicitly pins another release. Opening the updated console restarts an older CLI daemon. Previous hosted defaults under `tunnel.trqsh.uz` migrate to `api.trqsh.uz` and `trqsh.uz:4443`; custom endpoints, credentials and tunnel definitions are preserved.

Use one package manager for the global command. When switching from npm to pip, remove the npm launcher with `npm uninstall -g @trqsh-uz/trqsh`. Check `where.exe trqsh` on Windows or `command -v trqsh` on macOS/Linux if an older installation still appears. `python -m trqsh --version` explicitly selects the current Python environment's package.

## Uninstall

To clear local credentials, configuration and caches, run these commands **inside the console before removing the package**:

```text
/uninstall
/uninstall yes
```

The confirmation stops tunnels and removes local data; it does not delete your cloud account. Then use the original package manager:

```sh
# pipx
pipx uninstall trqsh

# pip
python -m pip uninstall trqsh
```

Package removal alone leaves separate agent data and the native binary cache.

## Troubleshooting

| Symptom | Next step |
| --- | --- |
| `trqsh` is not on PATH | For pip installs, use `python -m trqsh` in the environment where you installed it. |
| pipx command is unavailable | Check pipx's PATH setup and reopen the terminal. |
| Python cannot find the module | Use the same interpreter for installation and `python -m trqsh`. |
| Download or checksum fails | Check release-host or mirror access, then retry. |
| First launch takes longer | The wrapper is downloading and verifying the native CLI; subsequent launches reuse it. |

On Windows, the pip wrapper attempts to repair the user Scripts PATH when it can locate the launcher. This is best-effort; reopen the terminal after a reported change. pipx manages its own PATH.

## Package layout

```text
src/trqsh/__main__.py   Console and python -m trqsh entry point
src/trqsh/_runtime.py   Download, verification, cache and launch support
src/trqsh/_ui.py        Terminal installer presentation
src/trqsh/__init__.py   Python package version
```

The binary cache is `~/.cache/trqsh/<version>/`, or `$XDG_CACHE_HOME/trqsh/<version>/` when configured. Agent configuration and credentials are stored separately.

---

[Documentation](https://trqsh.uz/docs) · [CLI releases](https://github.com/trqsh-tunnel/trqshcli/releases) · [Report an issue](https://github.com/trqsh-tunnel/trqsh/issues) · [Source](https://github.com/trqsh-tunnel/trqsh)

Created by [Otabek Hamroqulov](https://github.com/Hamroqulovv). Licensed under [Apache-2.0](https://github.com/trqsh-tunnel/trqsh/blob/main/LICENSE).

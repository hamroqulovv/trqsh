![trqsh — Localhost, online.](https://raw.githubusercontent.com/trqsh-tunnel/trqsh/main/packaging/assets/readme-banner.svg)

# trqsh · npm

**Public URLs for local development. Installed with npm.**

Share development servers, receive webhooks and inspect traffic from an interactive terminal. This package installs the native CLI; the desktop app is a separate download.

CLI 0.2.4 connects to `https://tunnel.trqsh.uz` and uses authenticated WebSocket
transport through `wss://tunnel.trqsh.uz/_trqsh/agent`. Direct QUIC/TCP connections
remain available with `--server host:port`. Public tunnel URLs need wildcard
DNS/TLS and edge ingress in addition to the control-plane hostname.

[![npm](https://img.shields.io/npm/v/%40trqsh-uz%2Ftrqsh?style=flat-square&color=18181b)](https://www.npmjs.com/package/@trqsh-uz/trqsh)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D16-52525b?style=flat-square)](#requirements)
[![License](https://img.shields.io/badge/license-Apache--2.0-52525b?style=flat-square)](https://github.com/trqsh-tunnel/trqsh/blob/main/LICENSE)

[Quick start](#quick-start) · [First launch](#first-launch) · [Commands](#everyday-commands) · [Configuration](#configuration) · [Troubleshooting](#troubleshooting)

---

## Quick start

```sh
npm install -g @trqsh-uz/trqsh --foreground-scripts
trqsh --version
trqsh
```

Use the scoped package name **`@trqsh-uz/trqsh`**. `--foreground-scripts` makes installer messages visible; normal npm installation also works, but npm may hide them.

For a one-off launch without a global installation:

```sh
npx @trqsh-uz/trqsh
```

Once signed in, open the console and start a tunnel with `trqsh http 3000`.

### Requirements

| Requirement | Supported |
| --- | --- |
| Runtime | Node.js 16 or later; npm |
| Operating system | Windows, macOS, Linux |
| Architecture | x64 / amd64, arm64 |
| Network | npm registry and native CLI release assets |
| Console | Interactive terminal for setup and tunnel commands |

The wrapper has no third-party runtime dependencies. Windows extraction uses PowerShell with the .NET ZIP API; macOS and Linux use `tar`.

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

Update through npm to keep package records aligned:

```sh
npm install -g @trqsh-uz/trqsh@latest --foreground-scripts
```

The console also supports `/update check` and `/update`. Restart after a successful update. A usable self-updated binary is retained unless `TRQSH_VERSION` explicitly requests another version.

## Uninstall

Remove the package from your shell:

```sh
npm uninstall -g @trqsh-uz/trqsh
```

To also clear local credentials, configuration and caches, do this **before** removing the package, inside the console:

```text
/uninstall
/uninstall yes
```

The second command confirms local-data removal and stops tunnels. It does not delete your cloud account. Removing the npm package alone removes its vendored binary but leaves separate agent data.

## Troubleshooting

| Symptom | Next step |
| --- | --- |
| Installer output is hidden | Add `--foreground-scripts` to the installation command. |
| Install hooks were disabled | Run `trqsh`; its launcher prepares a missing or unusable binary. |
| `trqsh` is not found | Reopen the terminal and check npm's global prefix on PATH; use `npx @trqsh-uz/trqsh` for a one-off launch. |
| Download or checksum fails | Check access to the release host or configured mirror, then retry. |
| Console rejects a pipe or redirect | Use an interactive terminal. `trqsh --version` works for a simple installation check. |

## Package layout

```text
bin/trqsh.js     Launcher: arguments, standard streams and exit status
lib/common.js   Platform mapping and release configuration
lib/install.js  Download, verification and staged installation
lib/ui.js       Terminal installer presentation
vendor/         Downloaded native binary
```

---

[Documentation](https://trqsh.uz/docs) · [CLI releases](https://github.com/trqsh-tunnel/trqshcli/releases) · [Report an issue](https://github.com/trqsh-tunnel/trqsh/issues) · [Source](https://github.com/trqsh-tunnel/trqsh)

Created by [Otabek Hamroqulov](https://github.com/Hamroqulovv). Licensed under [Apache-2.0](https://github.com/trqsh-tunnel/trqsh/blob/main/LICENSE).

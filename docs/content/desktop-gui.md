# Desktop app (planned)

The desktop app is planned for a future release. It is not currently offered for download. Use the [CLI](/download) to manage tunnels today. The notes below describe the in-development workspace and may change before release.

## Install and sign in

Desktop installation instructions will be added when it is released. For the available CLI, follow [Installation](/docs/installation) and [Quickstart](/docs/quickstart).

The API key is persisted by the Go agent in `~/.trqsh/trqsh.yml` (Windows: `%USERPROFILE%\.trqsh\trqsh.yml`). The current app does not store it in an OS keychain.

## Start an HTTP tunnel

1. Start your local app in a terminal.
2. In desktop **Tunnels**, choose **New tunnel**.
3. Select **HTTP** and enter the local address, such as `3000` or `localhost:3000`.
4. Open advanced options if you need a name, reserved subdomain or Basic Auth.
5. Start the tunnel and copy its assigned public URL.

Reserve a requested subdomain first. For custom domains and advanced persisted settings, follow [Configuration](/docs/configuration) and [Custom domains](/docs/custom-domains).

The form exposes protocol choices supported by the core; its TLS choice does not establish the end-to-end passthrough guarantees discussed in [TCP & UDP tunnels](/docs/tcp-udp-tunnels).

## What each screen does

| Screen | Purpose |
| --- | --- |
| Tunnels | Start/stop local tunnels, copy URLs and view local traffic metrics. |
| Inspector | Browse local HTTP captures, filter them, inspect headers/bodies and replay. |
| Domains | Manage reserved names and add/verify custom domains. |
| API keys | Create keys, view prefixes and revoke credentials. |
| Billing | View the effective plan and available upgrade links. |
| Account | View profile, organization and usage. |
| Settings | Appearance, agent settings and update checks. |

Cloud account screens need Control API connectivity. Local tunnel/inspector data comes from the agent on `127.0.0.1:4041`.

## Keyboard shortcuts

Use **Cmd** on macOS and **Ctrl** on Windows/Linux for `Mod`.

| Shortcut | Action |
| --- | --- |
| `Mod+K` | Open the command palette. |
| `Mod+N` | New tunnel. |
| `Mod+1` | Tunnels. |
| `Mod+2` | Inspector. |
| `Mod+3` | Domains. |
| `Mod+4` | API keys. |
| `Mod+5` | Billing. |
| `Mod+6` | Account. |
| `Mod+7` | Settings. |
| `Ctrl+backtick` | Toggle the embedded terminal on every platform. |

## Window, tray and exit behavior

Closing the window hides the app to the system tray so tunnels can keep running. Reopen it from the tray. Use the app/tray **Quit trqsh** action when you intend to exit.

The desktop host shuts down its own bundled agent when it exits. The standalone console's `/quit` behavior differs: it leaves its background daemon running. Check the local tunnel list before assuming a service has stopped.

## CLI and desktop on one machine

Both use the same default config and loopback control port. Do not start competing agents on port 4041.

If the desktop reports that the agent is unavailable or its port is occupied, close the other trqsh interface cleanly, then relaunch the one you intend to use. Keep bundled desktop agent and standalone CLI versions compatible.

The desktop UI's local API connection is fixed to the default loopback port. A custom console `control_addr` is not automatically adopted by the desktop.

## Updates and privacy

**Check for updates** opens the available release download; the current app does not silently install an automatic signed update.

Captured traffic is held by the local agent with the [inspector's limits](/docs/inspector). The UI masks API keys by default. External links are restricted to HTTP/HTTPS, and the embedded UI has a Content Security Policy.

For connection or sign-in problems, follow [Troubleshooting](/docs/troubleshooting).

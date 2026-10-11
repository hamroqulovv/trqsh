![trqsh — Localhost, online.](../packaging/assets/readme-banner.svg)

# trqsh · Desktop

**A native workspace for tunnels, accounts and request inspection.**

A native desktop client (**Tauri v2**: Rust shell + React/TypeScript UI) that drives the
trqsh agent from a GUI: sign in, start/stop tunnels, watch the live request inspector, and
manage keys and domains. macOS / Windows / Linux.

Part of the [trqsh monorepo](../README.md). The agent it wraps is the same Go binary built
from [`cmd/trqsh`](../cmd/trqsh); the UI shares design tokens with
[`web/dashboard`](../web/dashboard) and [`web/site`](../web/site).

[Architecture](#architecture) · [Agent sidecar](#agent-sidecar) · [Quick start](#quick-start) · [Development commands](#development-commands) · [Releases](#releases)

| Package | Stack | Development URL |
| --- | --- | --- |
| `trqsh-desktop` · private | Tauri 2 · React 19 · TypeScript · Vite | `http://localhost:1420` |

## Architecture

The UI never touches the tunnel data path directly:

1. The app bundles the **Go agent** (`trqsh`) as a Tauri **sidecar**
   (`src-tauri/binaries/trqsh-<target-triple>`).
2. On launch, the Rust shell spawns `trqsh daemon`, which serves a token-authenticated
   loopback control API on `127.0.0.1:4041` (token in `~/.trqsh/control.token`).
3. The React UI is a plain `fetch` / `EventSource` client over that local API.

The agent and edge handle tunnel traffic; the interface manages their local
control surface. Configuration and the API key live in `~/.trqsh/`, separately
from application binaries.

## Agent sidecar

Tauri expects the agent binary at `src-tauri/binaries/trqsh-<host-triple>` (`.exe` on
Windows). Two ways to get it:

- **Local development, macOS/Linux** — build from the repository root:

  ```bash
  go build -o "desktop/src-tauri/binaries/trqsh-$(rustc -vV | sed -n 's/^host: //p')" ./cmd/trqsh
  ```

- **Local development, Windows PowerShell** — build from the repository root:

  ```powershell
  $triple = ((rustc -vV | Select-String '^host: ').ToString() -replace '^host: ', '')
  go build -o "desktop/src-tauri/binaries/trqsh-$triple.exe" ./cmd/trqsh
  ```

- **CI** — [`.github/workflows/desktop-build.yml`](../.github/workflows/desktop-build.yml)
  downloads the released `trqsh` CLI for each platform from the public
  [uzcreator/trqshcli](https://github.com/uzcreator/trqshcli) releases (the CLI's own dedicated
  release repo — source stays in this monorepo), verifies its checksum, and drops
  it in under the host-triple name. A packaged build therefore bundles the **most recently
  released** CLI, not backend tip-of-main — deliberate, so installers always ship a stable
  agent.

## Quick start

Install Node.js, pnpm and the platform's Rust build tools. Use the Go version
required by the root `go.mod` for local sidecar builds. CI currently uses Node
24, pnpm 10 and stable Rust. Prepare the sidecar above, then run from the
repository root:

```bash
cd desktop
pnpm install --frozen-lockfile
pnpm tauri dev        # native window; needs Rust + the platform's WebView

# UI-only in a browser (no native shell), against a running local agent:
pnpm dev              # http://localhost:1420
```

Requires **Rust** (stable) and, on Linux, the WebKitGTK / AppIndicator dev packages listed
in the build workflow. On Windows the UI renders in WebView2.

Browser-only development also needs a running local agent. Set
`VITE_CONTROL_ADDR` (default `http://127.0.0.1:4041`) and `VITE_CONTROL_TOKEN`
in a local Vite environment file when needed. The token is exposed to that
browser build; do not commit it or distribute a build containing it.

## Development commands

Run from `desktop/`:

| Command | Result |
| --- | --- |
| `pnpm dev` | Frontend development server on port 1420. |
| `pnpm typecheck` | TypeScript validation. |
| `pnpm build` | Typecheck and build frontend assets. |
| `pnpm preview` | Preview the built frontend. |
| `pnpm tauri dev` | Native development window. |
| `pnpm tauri build` | Native application bundles with the sidecar. |

## Project layout

```text
src/                  React interface, screens and agent client
src-tauri/            Rust shell and native configuration
src-tauri/binaries/   Native Go agent sidecar
src-tauri/icons/      Application and installer icons
vite.config.ts        Frontend development/build configuration
```

## Releases

The [desktop build workflow](../.github/workflows/desktop-build.yml) runs through
**manual dispatch** and produces Windows, macOS and Linux artifacts. Publishing
is opt-in through `publish: true` and creates `desktop-v<version>` releases.

The current workflow downloads its sidecar from `uzcreator/trqshcli` and publishes
to `uzcreator/trqsh`. Those legacy targets differ from the npm/Python wrappers'
`algorithco/trqshcli` default; check workflow targets before releasing. Desktop
and native CLI versions are independent.

Release notes currently describe unsigned preview builds. Check the actual
release notes for signing and platform-specific installation details.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Sidecar is missing | Build the exact target-triple filename, including `.exe` on Windows. |
| Interface has no agent data | Check daemon health, control address and local control token. |
| Browser-only view cannot authenticate | Supply the development token and restart Vite. |
| Linux native build fails early | Compare native libraries with the workflow dependency list. |

---

[Project overview](../README.md) · [Desktop user guide](../docs/content/desktop-gui.md) · [License](../LICENSE)

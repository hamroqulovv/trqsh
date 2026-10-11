# CLI reference

The current CLI is an interactive console backed by a local agent daemon. Launch it in a terminal, then use slash commands to manage tunnels.

This reference describes the commands registered in the current source. Packaged releases can lag behind it; use `trqsh --version` and your console's `/help` to check your installed build.

## Shell entry points

~~~sh
trqsh
trqsh http 3000
trqsh tcp 22
trqsh start
trqsh --version
trqsh --help
~~~

Bare `trqsh` opens the console. Positional input, such as `http 3000`, runs as its first console command. It does not turn the launcher into a noninteractive process.

Put root options before the initial command:

~~~sh
trqsh --transport tcp http 3000
trqsh --server 127.0.0.1:4443 --insecure http 3000
~~~

Use [Local agent API](/docs/local-api) for scripts and CI.

## Tunnel commands

Type these **inside the console**.

| Command | Action |
| --- | --- |
| `/http <port-or-host:port>` | Start a local HTTP service tunnel. |
| `/tcp <port-or-host:port>` | Start a raw TCP tunnel. |
| `/udp <port-or-host:port>` | Start a UDP tunnel when entitled. |
| `/start` | Start all saved tunnel definitions loaded from config. |
| `/ls` | List active tunnels, short IDs, URLs and metrics. |
| `/open [id]` | Open a matching tunnel URL in a browser. |
| `/copy [id]` | Copy its URL to the clipboard. |
| `/stop <id-or-name>` | Stop one matching tunnel. |
| `/stop all` | Stop all tunnels on this local agent. |
| `/requests` | Show recent local HTTP captures. |

An ID prefix, saved name or matching URL substring can select a tunnel. When several could match, use the full ID. `/open` and `/copy` without an argument select the first available tunnel.

### Command options

The current start-command parser accepts:

| Option | Use |
| --- | --- |
| `--subdomain NAME` or `-s NAME` | Request a name reserved by your account for an HTTP host. |
| `--remote-port PORT` | Request a public TCP/UDP service port. |

Use YAML or the local API for `basic_auth`, `host_header` and `custom_domain`. The parser does not apply arbitrary root flags placed after the command, or advanced flags such as `--domain` and `--basic-auth`.

The console splits input on whitespace. Shell-style quoting/escaping inside slash commands is not implemented; use config/API fields for values that contain spaces.

## Connection and panels

| Command | Action |
| --- | --- |
| `/status` | Show edge, transport and tunnel count. |
| `/pin traffic` | Keep a live request panel visible. |
| `/pin tunnels` | Keep the tunnel panel visible. |
| `/pin status` | Keep the connection panel visible. |
| `/unpin <panel>` | Remove one pinned panel. |
| `/unpin all` | Remove all pinned panels. |
| `/clear` | Clear the console transcript. |

Panels read the local agent's state. A signed-in idle agent need not have an established edge transport session until a tunnel starts.

## Account and domains

| Command | Action |
| --- | --- |
| `/login` | Begin browser device approval. |
| `/setup` | Reopen the welcome guide, with masked API-key input and first-tunnel setup. |
| `/login KEY` | Store an existing API key. |
| `/logout` | Stop local tunnels and clear the stored key. |
| `/whoami` | Show account, effective plan and usage. |
| `/subdomains` | List reserved names. |
| `/subdomains reserve NAME` | Reserve a subdomain. |
| `/subdomains release NAME_OR_ID` | Release a reservation. |
| `/domains` | List custom hostnames and verification state. |
| `/domains add HOSTNAME` | Add a custom domain and print DNS instructions. |
| `/domains verify HOSTNAME_OR_ID` | Check its ownership TXT record. |

See [Authentication](/docs/authentication), [Reserved subdomains](/docs/reserved-subdomains) and [Custom domains](/docs/custom-domains).

## QR commands

| Command | Action |
| --- | --- |
| `/qr` | Pair the console with a phone/browser for remote control. |
| `/qr TUNNEL_ID` | Display a QR for that tunnel's public URL. |
| `/qr stop` | End the remote-control pairing. |

A tunnel URL QR and a console-control QR grant different access. Follow [QR remote control](/docs/remote-control).

## System commands and lifecycle

| Command | Action |
| --- | --- |
| `/config` | Show selected startup settings and sign-in state. |
| `/version` | Show console build version/platform. |
| `/update check` | Check the latest release. |
| `/update` | Install an available CLI update; restart afterward. |
| `/uninstall` | Explain local-data removal. |
| `/uninstall yes` | Stop the agent and remove local config/credentials/cache. |
| `/help` | Show the registered command list. |
| `/quit` | Exit the console, leaving the daemon/tunnels running. |
| `/down` | Stop the background daemon and exit. |

An existing daemon is reused. To apply new environment/config values or an updated agent binary, stop it with `/down` before relaunching.

## Root options

| Flag | Meaning |
| --- | --- |
| `--config PATH` | Startup YAML file. |
| `--server HOST:PORT` | Edge agent transport endpoint. |
| `--region VALUE` | Region preference passed to the agent. |
| `--transport auto\|quic\|tcp` | Transport mode. |
| `--insecure` | Skip edge TLS verification for development. |
| `--log text\|json` | Daemon log format. |
| `--control-addr HOST:PORT` | Local control listener. |
| `--inspector-addr HOST:PORT` | Launcher setting; prefer YAML/environment for daemon startup. |

See [Configuration](/docs/configuration) for default values, precedence and the persistent `TRQSH_CONFIG` override.

## Keyboard use and aliases

Type `/` to bring up command completion. Arrow keys navigate suggestions or input history; Tab completes a suggestion. Enter completes missing argument input or runs the command once it is ready.

Aliases include `/list` and `/ps` for `/ls`, `/account` and `/me` for `/whoami`, `/subs` for `/subdomains`, `/domain` for `/domains`, `/?` for `/help`, and `/q` or `/exit` for `/quit`.

If your shell says the command is unknown, start with [Installation](/docs/installation). For connection failures, see [Troubleshooting](/docs/troubleshooting).

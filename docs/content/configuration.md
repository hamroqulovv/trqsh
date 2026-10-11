# Configuration

The agent reads YAML at startup. Save tunnel definitions here when you need custom domains, Basic Auth, Host-header rewriting or several tunnels.

## File location

Default paths:

| Platform | Location |
| --- | --- |
| macOS/Linux | `~/.trqsh/trqsh.yml` |
| Windows | `%USERPROFILE%\.trqsh\trqsh.yml` |

A missing file is allowed: the agent uses defaults and environment variables. Malformed YAML produces a startup error with the file path.

To choose a persistent custom location:

~~~sh
export TRQSH_CONFIG="$HOME/trqsh-work.yml"
trqsh
~~~

~~~powershell
$env:TRQSH_CONFIG = "$env:USERPROFILE\trqsh-work.yml"
trqsh
~~~

`trqsh --config ./trqsh.yml` chooses a startup file, but login persistence uses `TRQSH_CONFIG` or the default path. Use the environment variable when both must point to the same file.

## A complete example

~~~yaml
version: 1
server: "trqsh.uz:4443"
api_base: "https://trqsh.uz"
region: "auto"
transport: "auto"
log_level: "info"
control_addr: "127.0.0.1:4041"
insecure: false

inspector:
  enabled: true
  addr: "127.0.0.1:4040"

tunnels:
  web:
    proto: http
    addr: "localhost:3000"
    basic_auth: "reviewer:REPLACE_WITH_A_SECRET"
    host_header: "localhost:3000"

  ssh:
    proto: tcp
    addr: "localhost:22"
~~~

Sign in separately; this example deliberately contains no API key. Replace the Basic Auth password before use. You can omit `basic_auth` and `host_header` when your app does not need them.

## Top-level fields

| Field | Default | Meaning |
| --- | --- | --- |
| `version` | `1` | Configuration format marker. |
| `api_key` | unset | Cloud API key loaded by the agent. |
| `server` | `trqsh.uz:4443` | Edge transport address, including port. |
| `api_base` | `https://trqsh.uz` | Control API origin, without a trailing `/v1`. |
| `region` | `auto` | Region preference; actual routing depends on the deployment. |
| `transport` | `auto` | `auto` tries QUIC with TCP fallback; `quic` or `tcp` force one transport. |
| `control_addr` | `127.0.0.1:4041` | Local agent control API listener. |
| `insecure` | `false` | Skip edge certificate verification for local development. |
| `inspector.enabled` | `true` | Start the browser inspector listener. |
| `inspector.addr` | `127.0.0.1:4040` | Browser inspector address. |
| `log_level` | `info` | Stored logging preference; the current launcher creates an info-level logger. |
| `tunnels` | empty | Named tunnel definitions used by `/start`. |

## Tunnel fields

Each entry under `tunnels` is one named definition.

| Field | Required | Meaning |
| --- | --- | --- |
| `proto` | yes | Use `http`, `tcp` or `udp` for the documented workflows. |
| `addr` | yes | Local `host:port`, for example `localhost:3000`. |
| `subdomain` | no | Name reserved by your account, without the base domain. |
| `custom_domain` | no | Verified full hostname you own. |
| `basic_auth` | no | HTTP access credentials in `username:password` form. |
| `host_header` | no | Host header sent to the HTTP upstream. |
| `remote_port` | no | Requested public TCP/UDP port; zero/omitted lets the edge allocate one. |

Set either `subdomain` or `custom_domain` for an HTTP definition. Reserve/verify it first. The core also recognizes `https` and `tls` protocol identifiers, but they do not imply HTTPS-to-local forwarding or a documented end-to-end TLS-passthrough workflow. See [HTTP tunnels](/docs/http-tunnels).

## Start saved tunnels

After editing the file, launch the console and enter:

~~~text
/start
/ls
~~~

You can launch directly into this action with `trqsh start`. `/start` starts **all** loaded definitions; the current console does not implement `/start <name>`.

Repeated `/start` attempts create additional binds; they are not a reload/reconciliation command. Stop existing tunnels before starting the same definitions again.

## Environment variables

Only the following loader overrides are supported:

| Variable | Field |
| --- | --- |
| `TRQSH_CONFIG` | File location and local token/log directory. |
| `TRQSH_API_KEY` | `api_key` |
| `TRQSH_SERVER` | `server` |
| `TRQSH_API_URL` | `api_base` |
| `TRQSH_REGION` | `region` |
| `TRQSH_TRANSPORT` | `transport` |
| `TRQSH_LOG_LEVEL` | `log_level` |
| `TRQSH_INSPECTOR_ADDR` | `inspector.addr` |
| `TRQSH_CONTROL_ADDR` | `control_addr` |
| `TRQSH_INSECURE` | `insecure`; `1`, `true`, `yes` and `on` enable it. |

There is no general automatic mapping for every YAML field. For example, disable the inspector listener with `inspector.enabled: false` in YAML.

## Precedence and root flags

For fields exposed as root flags: **changed root flag → supported environment variable → file → default**.

Put root flags **before** the initial console command:

~~~sh
trqsh --transport tcp http 3000
trqsh --config ./trqsh.yml start
~~~

Arguments after `http 3000` are parsed by the console command. See [CLI reference](/docs/cli-reference) for which command flags actually work.

`--log json` selects JSON daemon logs; it is separate from the YAML `log_level` preference. Configure the inspector address in YAML or `TRQSH_INSPECTOR_ADDR` so the background daemon receives it reliably.

## Apply changes

An existing daemon is reused. Editing a file or environment variable does not reconfigure that running process.

1. Use `/down` to stop the current agent and its tunnels.
2. Edit the config or environment.
3. Launch trqsh again.
4. Run `/start` or start a tunnel manually.

`/config` displays selected startup settings with sign-in state; it does not open an editor or validate every field. Keep credential files out of version control.

For a local stack example, see [Self-hosting](/docs/self-hosting).

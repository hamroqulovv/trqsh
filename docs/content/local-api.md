# Local agent API

Control the agent running on your own computer from scripts and integrations. This is separate from the hosted [Control API](/docs/api).

The default listener is `http://127.0.0.1:4041`. Its paths do **not** start with `/v1`.

## Start the local agent

Opening the console starts/reuses its daemon:

~~~sh
trqsh
~~~

Sign in using `/login`, then leave the console open or use `/quit` to keep the daemon running. For headless jobs, the integration entry point is:

~~~sh
trqsh daemon
~~~

That process starts with zero tunnels and stays in the foreground. A script can run it as a job-owned background process and stop it when done. See [Webhooks & CI](/docs/webhooks-ci).

Set `TRQSH_API_KEY`, `TRQSH_CONFIG` and endpoint overrides **before** starting it. An already-running daemon does not reload your shell environment.

## Authenticate locally

Except for `GET /healthz`, requests require the local token stored beside the selected config at `~/.trqsh/control.token`.

~~~sh
TRQSH_LOCAL_TOKEN="$(cat "$HOME/.trqsh/control.token")"
curl -fsS \
  -H "Authorization: Bearer $TRQSH_LOCAL_TOKEN" \
  http://127.0.0.1:4041/status
~~~

If `TRQSH_CONFIG` selects another directory, use its sibling `control.token` file.

This token authorizes access to your local agent; it is not a `tq_` cloud API key. Use the cloud key only for cloud authentication or the local `POST /login` credential input.

## Start an HTTP tunnel

~~~sh
curl -fsS \
  -H "Authorization: Bearer $TRQSH_LOCAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"web","proto":"http","addr":"localhost:3000"}' \
  http://127.0.0.1:4041/tunnels
~~~

A successful response is a tunnel object containing `id`, `name`, `proto`, `local_addr`, `public_url`, `status`, `metrics` and `created_at`. Use the returned `public_url`; do not reconstruct a random hostname.

To protect a preview or rewrite its upstream Host header:

~~~json
{
  "name": "review",
  "proto": "http",
  "addr": "localhost:3000",
  "basic_auth": "reviewer:REPLACE_WITH_A_SECRET",
  "host_header": "localhost:3000"
}
~~~

Optional fields also include `subdomain`, `custom_domain` and `remote_port`. Reserve/verify cloud names first. See [Configuration](/docs/configuration).

## Windows PowerShell example

~~~powershell
$trqshTokenPath = Join-Path $env:USERPROFILE ".trqsh\control.token"
$trqshHeaders = @{
  Authorization = "Bearer $((Get-Content -LiteralPath $trqshTokenPath -Raw).Trim())"
}
$trqshBody = @{
  name = "web"
  proto = "http"
  addr = "localhost:3000"
} | ConvertTo-Json

$trqshTunnel = Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:4041/tunnels" `
  -Headers $trqshHeaders -ContentType "application/json" -Body $trqshBody

$trqshTunnel.public_url

Invoke-RestMethod -Method Delete `
  -Uri "http://127.0.0.1:4041/tunnels/$($trqshTunnel.id)" `
  -Headers $trqshHeaders
~~~

Use the config-selected token path when you override `TRQSH_CONFIG`.

## Endpoint reference

| Method and path | Behavior |
| --- | --- |
| `GET /healthz` | Unauthenticated readiness check. |
| `GET /status` | Current edge connection snapshot. |
| `GET /session` | Local sign-in/agent status. |
| `POST /login` | JSON `{"token":"YOUR_CLOUD_API_KEY"}`; persist a key. |
| `POST /logout` | Stop local tunnels and clear the stored key. |
| `GET /tunnels` | List this agent's tunnels. |
| `POST /tunnels` | Start a tunnel from a JSON spec. |
| `DELETE /tunnels/{id}` | Stop one tunnel. |
| `GET /requests` | List local HTTP captures. |
| `DELETE /requests` | Clear retained local captures. |
| `GET /events` | Agent events as server-sent events. |
| `POST /shutdown` | Ask a standalone daemon to stop. |
| `GET /update` | Check release information. |
| `POST /login/oauth/start` | Begin device approval. |
| `POST /login/oauth/poll` | Poll device approval with `device_code`. |
| `GET /cloud/me` | Account/plan view via the cloud API. |
| `GET /cloud/usage` | Cloud usage view. |
| `GET /cloud/plans` | Cloud plan catalog. |
| `GET, POST /cloud/keys` | List/create cloud API keys. |
| `DELETE /cloud/keys/{id}` | Revoke a cloud key. |
| `GET, POST /cloud/subdomains` | List/reserve cloud names. |
| `DELETE /cloud/subdomains/{id}` | Release a cloud reservation. |
| `GET, POST /cloud/domains` | List/add cloud domains. |
| `POST /cloud/domains/{id}/verify` | Verify a cloud domain. |
| `POST /remote/start` | Begin QR pairing. |
| `POST /remote/stop` | End QR pairing. |
| `POST /remote/publish` | Publish paired-console transcript/state. |

The cloud proxy endpoints use the agent's configured API key and `api_base`. Use the hosted API reference for their account-resource schemas.

## Errors and streaming

A failed tunnel start returns HTTP 502 with an `error` string. Other local routes can return plain-text HTTP errors; do not assume every failure uses the hosted API's JSON shape.

`GET /events` is a long-lived event stream. Read `data:` frames as JSON and reconnect when the connection closes. It is not a single JSON response.

The inspector's replay endpoints live on port 4040, not this listener. See [Request inspector](/docs/inspector).

## Listener restrictions

The server validates loopback Host headers and limits browser origins. Bind to loopback and retain token authentication. The development-only `TRQSH_CONTROL_NO_AUTH=1` bypass is not needed for the examples.

`POST /shutdown` stops a standalone daemon with a shutdown hook. A desktop-owned daemon can require the desktop host's Quit action. Stop only the process/agent owned by your automation.

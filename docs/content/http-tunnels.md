# HTTP tunnels

Expose a local HTTP service through a public HTTPS URL. Typical uses are development servers, APIs, webhook receivers and browser-based previews.

## Start a tunnel

From your shell:

~~~sh
trqsh http 3000
~~~

Or inside an already-open console:

~~~text
/http 3000
/http 127.0.0.1:8080
~~~

A bare port becomes `localhost:PORT`. Use a full `host:port` for a service reachable at another address. Do not include a URL path: the tunnel forwards request paths to the selected service.

Copy the actual public URL from `/ls` or `/copy`. Without a reserved name, a later tunnel can receive a different hostname.

## A stable subdomain

Reserve the name first:

~~~text
/subdomains reserve myapp
/http 3000 --subdomain myapp
~~~

`--subdomain` (or `-s`) is accepted by the current console's HTTP command. A requested name must belong to your account. Availability alone is insufficient.

See [Reserved subdomains](/docs/reserved-subdomains) for naming rules and release behavior.

## Basic Auth and Host headers

The current `/http` parser accepts the subdomain flag, but it does **not** apply `--basic-auth`, `--host-header` or `--domain`. Configure those features in YAML or through the [local agent API](/docs/local-api).

For example:

~~~yaml
tunnels:
  review:
    proto: http
    addr: "localhost:3000"
    basic_auth: "reviewer:REPLACE_WITH_A_SECRET"
    host_header: "localhost:3000"
~~~

Restart the console after editing, then enter `/start`.

Basic Auth asks visitors for credentials at the edge before forwarding the request. The `host_header` value rewrites the upstream Host header, which helps development frameworks that reject unknown hostnames. Keep your framework's allowed-host settings consistent with the chosen value.

Do not commit real passwords or API keys. See [Configuration](/docs/configuration) for file locations and reload behavior.

## Custom hostname

Add and verify your hostname, then use a saved definition:

~~~yaml
tunnels:
  website:
    proto: http
    addr: "localhost:3000"
    custom_domain: "preview.example.com"
~~~

See [Custom domains](/docs/custom-domains) for the DNS and verification steps. The example hostname must be replaced with one you own.

## HTTPS and the local target

The connection has three parts:

1. Visitor → public edge: HTTPS when using the HTTPS URL.
2. Agent → edge: encrypted QUIC or TLS-over-TCP.
3. Agent → local app: **HTTP** for the documented HTTP workflow.

Your local app can run ordinary HTTP. The current forwarding code sends HTTP to the upstream even when a saved definition uses `proto: https`; that value does not enable HTTPS-to-local forwarding. The console does not provide an `/https` command.

If the upstream accepts only HTTPS, put a local HTTP reverse proxy in front of it, or choose an appropriate raw TCP workflow with the service's own TLS. Do not send HTTP to a TLS-only port such as 8443 and expect it to work.

## WebSockets and streaming

The agent forwards HTTP Upgrade connections, including WebSockets, over a dedicated local connection. Keep the local service running and use the public host in your client's connection URL.

The inspector records normal HTTP request/response exchanges. WebSocket frames and raw streams are not individual inspector captures. Long-lived responses may not appear as a completed capture until the exchange finishes.

## Verify and stop

~~~text
/status
/ls
/pin traffic
~~~

Test the assigned URL from another terminal:

~~~sh
curl -i https://YOUR-ASSIGNED-HOST/health
~~~

Use a route your app actually implements. Then stop one tunnel by ID, or all of this agent's tunnels:

~~~text
/stop TUNNEL_ID
/stop all
~~~

`/quit` leaves the agent running; `/down` stops it.

## Troubleshooting

| Symptom | First check |
| --- | --- |
| 502 or local-service error | Open the local address directly; check the port and HTTP protocol. |
| Invalid Host / blocked request | Set `host_header` or adjust the framework's allowed hosts. |
| Named host is rejected | Reserve it with the same account before binding it. |
| Login works, tunnel cannot connect | Check edge port 4443 and transport connectivity. |
| Public URL still shows an old app | Check `/ls`, stop the old bind and start the intended definition. |

Continue with [Troubleshooting](/docs/troubleshooting) or [Request inspector](/docs/inspector).

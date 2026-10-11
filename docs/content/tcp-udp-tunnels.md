# TCP & UDP tunnels

Use raw transport tunnels for services that do not speak HTTP. TCP and UDP traffic is forwarded to the local destination without HTTP request inspection.

The tunnel protocol and agent transport are different settings: `/tcp` chooses what visitors send, while `transport: tcp` chooses how the agent connects to the edge.

## TCP: expose an existing service

For an SSH server listening locally on port 22:

~~~text
/tcp 22
/ls
~~~

Or launch from your shell:

~~~sh
trqsh tcp 22
~~~

The edge returns a URL shaped like `tcp://HOST:PORT`. Use the **returned host and port**, not the agent's transport port 4443.

For SSH:

~~~sh
ssh -p ASSIGNED_PORT your-user@ASSIGNED_HOST
~~~

TCP tunnels can also forward database connections and custom TCP protocols. The service still handles its own authentication and, when required, its own TLS. trqsh does not create a database user or SSH account for you.

## Request a public port

~~~text
/tcp 22 --remote-port 2222
~~~

`--remote-port` requests a port; it is not a permanent reservation. The edge's port pool, availability and deployment firewall determine whether it can be used.

If the edge reports [ERR_PORT_UNAVAILABLE](/docs/errors#err_port_unavailable), omit the flag or choose an allowed available port. The local port and public port can differ.

## UDP: expose a datagram service

For a UDP service listening on port 51820:

~~~text
/udp 51820
~~~

A full local address also works:

~~~text
/udp 127.0.0.1:51820 --remote-port 30020
~~~

The returned URL is shaped like `udp://HOST:PORT`. Configure the connecting client with that host and port using the UDP application's own settings.

UDP requires a plan that allows UDP. A disallowed bind returns [ERR_PLAN_FORBIDS](/docs/errors#err_plan_forbids). For self-hosting, the allocated UDP port must also be reachable through the host/container network and firewall.

UDP is datagram traffic: packet loss, idle association expiry and application retry behavior still apply. It does not become a reliable byte stream just because the agent prefers QUIC.

## Save several services

~~~yaml
tunnels:
  ssh:
    proto: tcp
    addr: "localhost:22"

  game:
    proto: udp
    addr: "localhost:27015"
~~~

Launch the console and use `/start`. Check [Configuration](/docs/configuration) for the exact schema and [CLI reference](/docs/cli-reference) for lifecycle commands.

## TLS-specific limitations

The current console has `/http`, `/tcp` and `/udp` commands; there is no `/tls` command. Although the core/config accepts a `tls` identifier and plans contain a TLS entitlement, this is not a verified end-to-end SNI passthrough workflow in the current edge.

For a service that already speaks TLS, use a raw TCP tunnel when a host-and-port endpoint suits your application. Its encrypted protocol bytes pass through the TCP tunnel, and the service must provide a certificate/name configuration appropriate for its clients.

## Plan and connectivity checks

TCP is allowed by the current Free, Pro and Team catalog; UDP is allowed on Pro and Team. Consult [Pricing](/pricing) and your account's effective plan rather than assuming that every deployment has the same enabled network services.

To diagnose a failure:

1. Confirm the service accepts a local TCP connection or UDP packet.
2. Check `/status` and the bind result.
3. Connect to the assigned public host and port.
4. Check firewall/container port exposure on a self-hosted edge.
5. Use the service's own logs for protocol errors.

HTTP Basic Auth and the HTTP inspector do not protect or inspect raw TCP/UDP services. See [Security](/docs/security) for the applicable boundaries.

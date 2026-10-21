# Security & privacy

Understand the boundaries before exposing a local service. trqsh provides tunnel transport and access controls; your application remains responsible for its own authorization and data handling.

## Where encryption applies

For the normal HTTP workflow:

| Connection | Protection |
| --- | --- |
| Visitor → public HTTPS URL | TLS terminates at the edge. |
| Agent → edge | Encrypted QUIC, authenticated TLS-over-TCP, or authenticated WebSocket over HTTPS, depending on the configured endpoint. |
| Agent → local HTTP service | Plain HTTP to the configured local destination. |
| Browser → production dashboard/API | HTTPS when the deployment is configured correctly. |

This is not end-to-end encryption between a visitor and a local HTTP app: the edge handles the HTTP request. A raw TCP tunnel can carry an application's own encrypted protocol, such as SSH or service-managed TLS.

Local development may use HTTP frontends and self-signed edge certificates. `insecure: true` skips certificate verification and is intended only for that setup.

## Public exposure and access control

A random URL is not an authentication mechanism. Anyone who learns it can request the exposed service unless your app or tunnel access controls reject them.

For HTTP previews, use `basic_auth` in a saved tunnel definition when appropriate. For TCP/UDP, retain the service's own authentication. Do not expose the local agent control port or inspector as a public tunnel.

Only tunnel services and data you are authorized to share. Avoid exposing development admin routes, database consoles or secrets by accident.

## API keys

Cloud API keys are random credentials, hashed on the Control API side and returned in full once at creation. The local agent stores its working key in the YAML config.

- Use a separate key per machine or automation.
- Keep config and environment secrets out of source control and build logs.
- Rotate exposed keys and revoke old ones in the dashboard.
- Check whether a key was supplied through an environment variable before assuming logout has removed every source.

See [Authentication](/docs/authentication) for persistence and revocation behavior.

## Local agent and captures

The control API normally binds to `127.0.0.1:4041` and requires the token in `~/.trqsh/control.token`. It also checks loopback Host headers and limits allowed origins.

The inspector normally binds to `127.0.0.1:4040`. Its Host guard blocks non-loopback hosts, but it relies on local access rather than cloud login. Captures can contain cookies, authorization headers and request bodies.

The recorder keeps up to 256 exchanges and 64 KiB per body in memory. Clear captures when no longer needed and keep both listeners on loopback. See [Request inspector](/docs/inspector).

## QR remote control

A QR pairing URL/code is a temporary capability: anyone holding it can view the shared console and send allowed console commands. It does not require a separate viewer login.

Share it only with someone you trust and end it using `/qr stop`. The current relay temporarily holds console transcript/state in the Control API process. This is distinct from a cloud HTTP-body archive.

See [QR remote control](/docs/remote-control) for lifetime and blocked commands.

## Account isolation and limits

The normal entitlement provider checks credentials, protocol access, reserved-name ownership, verified-domain ownership and applicable quotas when binding a tunnel. A hostname cannot have two active owners.

Development stub entitlements and passwordless development sign-in are conveniences for local testing. Production operators must use the real API entitlement provider and production authentication settings.

Rate limits and request-size controls reduce abuse; they are not a promise that an exposed application cannot be attacked. Infrastructure-level protection depends on the deployment.

## Report abuse or a vulnerability

For abuse involving a trqsh hostname, contact **hello@trqsh.uz** with the hostname, time (including time zone) and relevant evidence.

For a security vulnerability, follow the repository security policy and contact **hello@trqsh.uz** with the subject “Security report”. Include the affected component/version, impact and reproduction steps. Avoid publishing working credentials or private captured traffic in a public issue.

Use the [Terms](/terms), [Privacy policy](/privacy), [Cookies & storage](/cookies), and [Acceptable use policy](/acceptable-use) for the hosted service's policies. The privacy policy distinguishes local captures from hosted account and tunnel-history records. Self-hosted operators control their own retention, access and infrastructure.

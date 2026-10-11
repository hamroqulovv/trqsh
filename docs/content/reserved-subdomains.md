# Reserved subdomains

Reserve a name to reuse the same public hostname across tunnel restarts. This is useful for webhook callbacks, OAuth redirects and links you share with teammates.

A reservation keeps the **name**. It does not keep your app running or the tunnel connected.

## Reserve and list names

Inside the console:

~~~text
/subdomains reserve myapp
/subdomains
~~~

You can also manage reservations in the dashboard's **Domains** page, which includes both reserved subdomains and custom domains.

A name uses lowercase letters, digits and hyphens, is 1–63 characters long, and cannot begin or end with a hyphen. Enter `myapp`, not a URL or `myapp.trqsh.uz`. The API normalizes the name to lowercase.

If someone has already reserved it, choose another name.

## Bind the reserved name

~~~text
/http 3000 --subdomain myapp
~~~

From your shell:

~~~sh
trqsh http 3000 --subdomain myapp
~~~

On a deployment using `trqsh.uz` as the base domain, the resulting host is `myapp.trqsh.uz`. A self-hosted deployment uses its own configured base domain.

The account/key that starts the tunnel must own the reservation. An available but unreserved name is rejected by the normal entitlement provider.

## Save the definition

~~~yaml
tunnels:
  web:
    proto: http
    addr: "localhost:3000"
    subdomain: "myapp"
~~~

Restart after changing the file and run `/start`. See [Configuration](/docs/configuration).

Only one active bind can own the hostname at a time. Stop an existing tunnel before rebinding the same name from another process or computer.

## Limits

The current catalog allows one reservation on Free, ten on Pro and fifty on Team. Reservations are account/organization resources, not per-computer resources.

Check [Pricing](/pricing) and the dashboard for your effective plan. A reservation-count limit and an active-tunnel limit are separate constraints.

## Release a name

~~~text
/stop TUNNEL_ID
/subdomains release myapp
~~~

The release command also accepts the reservation ID. It frees the name for others to reserve. Stop its active tunnel first; releasing the reservation is not a replacement for stopping a local agent.

If you still need a stable webhook URL, update the provider before releasing the name.

## Common errors

- [ERR_SUBDOMAIN_FORBIDDEN](/docs/errors#err_subdomain_forbidden): the name is not reserved by the account starting the tunnel.
- [ERR_SUBDOMAIN_TAKEN](/docs/errors#err_subdomain_taken): another reservation or active bind owns the name.
- HTTP 403 while reserving through the API: the reservation limit is reached.
- HTTP 409 while reserving: the requested name is already taken.

For a hostname under your own domain, follow [Custom domains](/docs/custom-domains).

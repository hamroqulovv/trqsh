# Custom domains

Use a hostname you own, such as `preview.example.com`, as an HTTP tunnel endpoint. You need access to its DNS records and a plan that permits custom domains.

Adding the domain, verifying ownership and starting a tunnel are three separate steps.

## 1. Add the hostname

Inside the console:

~~~text
/domains add preview.example.com
~~~

Or open **Domains** in the dashboard and add it there. Enter only the hostname: no `https://`, port or path.

trqsh returns a domain record and DNS instructions. Copy the values from **your actual response**.

## 2. Create both DNS records

The response contains:

| Field | Purpose |
| --- | --- |
| `txt_name` | Ownership-challenge DNS name. |
| `txt_value` | Unique verification token. |
| `cname_name` | Your tunnel hostname. |
| `cname_value` | This deployment's configured base domain. |

A typical shape is:

~~~text
TXT    _trqsh-challenge.preview.example.com   trqsh-verify=YOUR_TOKEN
CNAME  preview.example.com                    DEPLOYMENT_BASE_DOMAIN
~~~

These are placeholders. Do not copy another account's token or assume the CNAME target is `edge.trqsh.uz`.

Some DNS providers append the zone name automatically; check that the final TXT name is exactly the one returned. At the same hostname, a CNAME normally cannot coexist with an A or AAAA record. Prefer a dedicated subdomain.

If your DNS provider has a proxy toggle, use direct/DNS-only routing while verifying and testing. A proxy must support the TLS and routing behavior you intend to use.

## 3. Verify ownership

Wait until the TXT record is visible, then run:

~~~text
/domains verify preview.example.com
/domains
~~~

You can also click **Verify** in the dashboard.

Inspect the record with your OS's DNS tools:

~~~sh
nslookup -type=TXT _trqsh-challenge.preview.example.com
nslookup preview.example.com
~~~

Verification checks the token on the TXT record. A successful ownership check does not itself confirm that the CNAME is correct or that a certificate has finished issuing.

## 4. Bind your HTTP service

The current `/http` command does not apply a `--domain` flag. Put the hostname in a saved definition:

~~~yaml
tunnels:
  preview:
    proto: http
    addr: "localhost:3000"
    custom_domain: "preview.example.com"
~~~

Restart the console after editing the config, then enter:

~~~text
/start
/ls
~~~

Alternatively, send the same `custom_domain` field to the [local agent API](/docs/local-api).

## 5. Confirm HTTPS

Open `https://preview.example.com` and check both the certificate and your app's response.

On a correctly configured production edge, verified custom domains are eligible for automatic certificate issuance and renewal. The operator must configure ACME, public routing and reachable validation ports. Local development uses self-signed certificates and does not issue a public trusted certificate.

## Plan limits

The current catalog allows up to five custom domains on Pro and fifty on Team. Free has no custom-domain entitlement. Check [Pricing](/pricing) and your effective account plan.

The current public API supports listing, adding and verifying domains; it does not expose a custom-domain deletion endpoint. Avoid assuming an undocumented `DELETE /domains/{id}` action exists.

## Troubleshooting

- **TXT not found:** check the final DNS name, exact token and DNS propagation.
- **ERR_DOMAIN_UNVERIFIED:** verify with the same account that starts the tunnel.
- **Verified but no response:** check CNAME routing, local app, active bind and edge ingress.
- **Certificate error:** check production ACME configuration, hostname coverage and certificate status separately from ownership verification.
- **Plan denied:** confirm that the paid grant has not expired.

See [Troubleshooting](/docs/troubleshooting) for transport and upstream checks.

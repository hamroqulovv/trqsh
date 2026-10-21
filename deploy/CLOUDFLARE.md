# Cloudflare setup for tunnel.trqsh.uz

For the new `trqsh.uz` / `app.trqsh.uz` / `api.trqsh.uz` production deployment and GitHub/Google-only authentication, use [DOMAIN-AUTH.md](DOMAIN-AUTH.md). Earlier single-origin addresses and audit results below describe the previous deployment.

Use the same Cloudflare Tunnel connector for the control plane and generated
HTTP/HTTPS tunnel URLs. These steps assume `cloudflared` runs on Windows on
the same computer as Docker, as in the current local setup.

| Public hostname | Service type | Service URL |
| --- | --- | --- |
| `tunnel.trqsh.uz` | HTTP | `localhost:3004` |
| `*.tunnel.trqsh.uz` | HTTP | `localhost:80` |

The first route serves the website, dashboard, API and WebSocket agent endpoint.
The second reaches the edge, which selects the user's local application by
the incoming hostname. Visitors use HTTPS even though the local service is HTTP.

## 1. Check the local services

In PowerShell, from the repository root:

```powershell
docker compose -f deploy/docker-compose.single.yml ps
curl.exe -I http://localhost:3004
```

The container should be healthy. Keep your local web application running and
keep the trqsh tunnel online. A bare request to port 80 without a generated
hostname can return 404; the edge needs the tunnel's Host header.

## 2. Open the existing Cloudflare connector

1. Sign in to the Cloudflare dashboard and open **Networking > Tunnels**.
2. Select the connector already serving `tunnel.trqsh.uz` and check it is healthy.
3. Open **Routes > Add route > Published application**. If your account shows
   the older Zero Trust layout, open your connector's **Public Hostnames** tab
   and select **Add a public hostname** instead.

You can add both hostnames to the existing connector. A second connector or
router port-forward is not needed.

## 3. Keep the control-plane route

Check the existing route has these values:

| Field | Value |
| --- | --- |
| Subdomain | `tunnel` |
| Domain | `trqsh.uz` |
| Path | Empty |
| Service type | HTTP |
| URL | `localhost:3004` |

Save if you made corrections. This route already works in the current setup.

## 4. Add the generated-tunnel route

Create another published application in the same connector:

| Field | Value |
| --- | --- |
| Subdomain | `*.tunnel` |
| Domain | `trqsh.uz` |
| Path | Empty |
| Service type | HTTP |
| URL | `localhost:80` |
| HTTP Host Header override | Empty / preserve the incoming hostname |

The resulting public hostname must be `*.tunnel.trqsh.uz`. Save the route if
your dashboard accepts it. The current "Add published application" dialog was
observed rejecting `*.tunnel` with "Invalid subdomain format"; use the API
procedure below when that happens. This validation error is separate from the
certificate-coverage warning.
Its origin is port **80**; port 3004 serves the control plane. Preserving the
original Host header lets the edge select the correct local application.

For a single-host test in that form, use subdomain `z1zsto95.tunnel` with domain
`trqsh.uz` and service URL `http://localhost:80`. This publishes only the current
hostname; future generated names still need a wildcard route. HTTPS certificate
coverage is required in either case.

### Wildcard route through the Cloudflare API

Cloudflare's tunnel configuration supports wildcard ingress. For the current
remotely managed connector, update its remote configuration through the API;
editing a local YAML file does not update a token-managed connector's routes.

1. Copy your **Account ID** from the Cloudflare account dashboard and your
   **Tunnel ID** from the existing connector. The Tunnel ID is a UUID.
2. In **My Profile > API Tokens > Create Token > Custom token**, grant the
   account-scoped tunnel Edit permission for your account. Depending on the UI,
   its name is **Cloudflare Tunnel** or **Cloudflare One Connector: cloudflared**.
3. In PowerShell from the repository root, replace the two ID placeholders in
   the following block. It reads the current configuration, backs it up under
   ignored `data/`, and prepares a wildcard rule while retaining existing rules.
   Enter the API token only at the masked local prompt:

   ```powershell
   $cfAccountId = 'YOUR_ACCOUNT_ID'
   $cfTunnelId = 'YOUR_TUNNEL_UUID'
   $cfSecureToken = Read-Host 'Cloudflare API token' -AsSecureString
   $cfHeaders = @{
       Authorization = 'Bearer ' + [Net.NetworkCredential]::new('', $cfSecureToken).Password
   }
   $cfConfigUrl = "https://api.cloudflare.com/client/v4/accounts/$cfAccountId/cfd_tunnel/$cfTunnelId/configurations"
   $cfResponse = Invoke-RestMethod -Method Get -Uri $cfConfigUrl -Headers $cfHeaders -ErrorAction Stop
   if (-not $cfResponse.success -or -not $cfResponse.result.config.ingress) {
       throw 'Could not read the existing connector configuration.'
   }
   $cfConfig = $cfResponse.result.config
   $cfRules = @($cfConfig.ingress)
   if ($cfRules[-1].hostname -or $cfRules[-1].path) {
       throw 'The existing configuration must end with a catch-all rule.'
   }
   if (@($cfRules | Where-Object { $_.hostname -eq '*.tunnel.trqsh.uz' }).Count) {
       throw 'A wildcard rule already exists; inspect its service URL instead of adding a duplicate.'
   }
   New-Item -ItemType Directory -Path data -Force | Out-Null
   $cfBackup = Join-Path 'data' ('cloudflare-config-before-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
   $cfConfig | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $cfBackup -Encoding UTF8
   $cfWildcard = [pscustomobject]@{
       hostname = '*.tunnel.trqsh.uz'
       service = 'http://localhost:80'
       originRequest = @{ httpHostHeader = '' }
   }
   $cfExistingRoutes = @($cfRules | Select-Object -SkipLast 1)
   $cfConfig.ingress = @($cfExistingRoutes) + @($cfWildcard) + @($cfRules[-1])
   $cfConfig.ingress | Select-Object hostname, path, service | Format-Table
   $cfBody = @{ config = $cfConfig } | ConvertTo-Json -Depth 100
   ```

4. Review the displayed routes. The `tunnel.trqsh.uz` service must still be
   `http://localhost:3004`, and the new wildcard must reach `http://localhost:80`.
   The wildcard belongs before the final catch-all. If another earlier wildcard
   also matches these names, arrange the more specific rule ahead of it.
5. In the same PowerShell session, apply the prepared configuration:

   ```powershell
   $cfUpdated = Invoke-RestMethod -Method Put -Uri $cfConfigUrl -Headers $cfHeaders `
       -ContentType 'application/json' -Body $cfBody -ErrorAction Stop
   if (-not $cfUpdated.success) { throw 'Cloudflare rejected the configuration.' }
   $cfUpdated.result.config.ingress | Select-Object hostname, path, service | Format-Table
   Remove-Variable cfHeaders, cfSecureToken, cfBody
   ```

6. Continue with wildcard DNS and certificate coverage below. The configuration
   API updates ingress; it does not create the DNS record or edge certificate.

If you later move `cloudflared` into another container, `localhost` refers to
that container. Use a reachable host/container address and adjust the current
loopback-only port bindings for that topology.

## 5. Add or verify wildcard DNS

1. In the Cloudflare website dashboard, select the `trqsh.uz` zone.
2. Open **DNS > Records**.
3. Find the existing `tunnel` CNAME and copy its target. It normally looks like
   `<YOUR-TUNNEL-UUID>.cfargotunnel.com`. The UUID is the Cloudflare connector's
   tunnel ID, not a generated trqsh tunnel ID or a secret connector token.
4. Check whether a `*.tunnel` record already exists. If not, select **Add record**.
5. Set these values and save:

| DNS field | Value |
| --- | --- |
| Type | CNAME |
| Name | `*.tunnel` |
| Target | Same `<YOUR-TUNNEL-UUID>.cfargotunnel.com` target as the `tunnel` record |
| Proxy status | Proxied (orange cloud) |
| TTL | Auto |

The record should appear as `*.tunnel.trqsh.uz`. This one record covers newly
generated names; no separate DNS entry is needed for each trqsh HTTP tunnel.

## 6. Check HTTPS certificate coverage

1. Open `trqsh.uz` **SSL/TLS > Edge Certificates**.
2. Check for an **Active** certificate that explicitly covers
   `*.tunnel.trqsh.uz`.
3. A certificate covering only `trqsh.uz` and `*.trqsh.uz` does not cover
   `random.tunnel.trqsh.uz`.

For a normal full Cloudflare DNS setup, the default Universal SSL certificate
does not cover this extra hostname level. If you do not already have suitable
coverage, Cloudflare's Advanced Certificate Manager is a **paid add-on** that
can issue the required wildcard certificate:

1. With that add-on enabled, select **Order Advanced Certificate**.
2. Include the zone apex and required wildcard. If replacing coverage for other
   existing hosts, include those too. For this deployment use:

   ```text
   trqsh.uz
   *.trqsh.uz
   *.tunnel.trqsh.uz
   ```

3. Choose an available certificate authority, validation method and validity
   period. Complete any DNS validation Cloudflare requests.
4. Wait until the certificate is **Active**, then test the public HTTPS URL.

Wildcard DNS and wildcard certificates are separate settings. Adding DNS alone
fixes NXDOMAIN but does not provide missing certificate coverage. A certificate
is unnecessary to resolve a name, but it is required for a valid HTTPS visit.

## 7. Test an online trqsh tunnel

Use the current URL shown by `/ls` inside the trqsh console. For the reported URL:

```powershell
Resolve-DnsName z1zsto95.tunnel.trqsh.uz
curl.exe -I https://z1zsto95.tunnel.trqsh.uz
```

Open the same HTTPS address in your browser. The DNS lookup should resolve
through Cloudflare. The HTTP response depends on your application; a HEAD-only
405 can mean your application requires a normal browser GET.

If DNS is corrected but your computer still caches the old failure, run
`ipconfig /flushdns` and retry the browser.

| Result | What to check |
| --- | --- |
| `DNS_PROBE_FINISHED_NXDOMAIN` | Wildcard DNS record, zone, and cached DNS failure |
| Certificate / cipher mismatch | Active edge certificate covering `*.tunnel.trqsh.uz` |
| Connector/origin error | Connector health and reachability of `localhost:80` |
| Marketing website appears | Wildcard route must reach port 80 |
| Edge cannot reach the local app | Local app port and online trqsh agent |

During diagnosis, the reported tunnel was online and a request to the local edge
with its hostname returned HTTP 200. Public DNS for that hostname returned
NXDOMAIN, so the request was failing before reaching the working local tunnel.

## References

- [Published application setup](https://developers.cloudflare.com/tunnel/get-started/)
- [Wildcard ingress matching](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/configuration-file/)
- [Tunnel DNS records](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/dns/)
- [Wildcard DNS records](https://developers.cloudflare.com/dns/manage-dns-records/reference/wildcard-dns-records/)
- [Universal SSL coverage](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/)
- [Advanced certificates](https://developers.cloudflare.com/ssl/edge-certificates/advanced-certificate-manager/)
- [Ordering an advanced certificate](https://developers.cloudflare.com/ssl/edge-certificates/advanced-certificate-manager/manage-certificates/)
- [Remote tunnel configuration API](https://developers.cloudflare.com/api/typescript/resources/zero_trust/subresources/tunnels/subresources/cloudflared/subresources/configurations/methods/update/)

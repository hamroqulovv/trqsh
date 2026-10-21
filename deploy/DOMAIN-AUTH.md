# TRQSH.UZ deployment and OAuth

This is the production layout for the next deployment. The server has not been
provisioned, OAuth applications have not been created, and CLI 0.2.6 has not been
published yet. Use the new server's address throughout; no existing VPS is a
default deployment target.

## Public addresses

| Surface | Address | Internal service |
| --- | --- | --- |
| Website, documentation, installer | `https://trqsh.uz` | `site:3000` |
| Dashboard and device approval | `https://app.trqsh.uz` | `dashboard:3000` |
| API and OAuth callbacks | `https://api.trqsh.uz` | `api:8080` |
| Optional QR viewer | `https://qr.trqsh.uz` | dashboard |
| Optional operator console | `https://approve.trqsh.uz` | API; disabled without admin credentials |
| Customer HTTP tunnels | `https://<name>.trqsh.uz` | authenticated edge routing |
| Default CLI transport | `trqsh.uz:4443` | QUIC, with TCP fallback |

`app`, `api`, `www`, `qr`, `approve` and the other names in
`internal/platform/hosts.go` are reserved for the platform. Their traffic takes
precedence over tenant tunnel routes. Authentication cookies are host-only,
HttpOnly and Secure with the `__Host-` prefix; no session cookie is shared with
`*.trqsh.uz`.

Create DNS A records for `@`, `*`, `app`, `api`, `www`, `qr` and, if used,
`approve`, pointing at the **new server IP**. Publish AAAA records only if that
server also has working IPv6 ingress. Use DNS-only records for the direct
QUIC/TCP deployment: an ordinary Cloudflare HTTP proxy does not forward port
4443. Permit TCP 80/443 and TCP+UDP 4443; UDP 443 is optional HTTP/3 ingress.
PostgreSQL, Redis, internal RPC and metrics stay on the private Docker network.

Use a browser-trusted certificate for the apex and platform hosts and a wildcard
`*.trqsh.uz` certificate through DNS-01, or the existing on-demand TLS mode.
Do not begin real OAuth sign-in while using ACME staging certificates.

## Create the GitHub OAuth application

Create an OAuth App under the intended GitHub owner with:

- Application name: `trqsh`.
- Homepage URL: `https://trqsh.uz`.
- Authorization callback URL: `https://api.trqsh.uz/v1/auth/oauth/github/callback`.

Save the client ID and generated client secret in the new server's
`/opt/trqsh/deploy/.env`, using `TRQSH_GITHUB_CLIENT_ID` and
`TRQSH_GITHUB_CLIENT_SECRET`. Restrict this file to the deployment operator
(`chmod 600`) and never commit it. The application requests only `read:user` and
`user:email`; it always checks GitHub's primary email verification status,
including when a public profile email is present. Private verified emails work.

## Create the Google OAuth application

In Google Cloud, configure the OAuth consent screen / Google Auth Platform:

1. Set the application name and support/developer contacts. Add `trqsh.uz` as an
   authorized domain and complete domain ownership requirements shown by Google.
2. Set the homepage to `https://trqsh.uz`, privacy policy to
   `https://trqsh.uz/privacy`, and terms to `https://trqsh.uz/terms`.
3. Choose the intended external audience. During testing, add test users. Before
   general availability, publish the consent configuration and complete any
   verification Google requires for that configuration.
4. Create a **Web application** OAuth client. Authorized redirect URI:
   `https://api.trqsh.uz/v1/auth/oauth/google/callback`. If asked for an authorized
   JavaScript origin, use `https://app.trqsh.uz`; this application uses a server
   authorization-code flow, not browser token storage.
5. Save the ID and secret as `TRQSH_GOOGLE_CLIENT_ID` and
   `TRQSH_GOOGLE_CLIENT_SECRET` in the same protected server environment file.

Scopes are `openid email profile`. Google must return both a stable subject ID
and `email_verified: true`; a missing flag also fails sign-in. Both providers
use PKCE S256, browser-bound single-use state, a provider-bound verifier, and a
short-lived single-use dashboard exchange. Access and refresh tokens never
appear in browser redirect URLs.

## Configure and stage the new server

Use `deploy/docker-compose.prod.yml` for the multi-service deployment:

1. Copy `deploy/.env.prod.example` to `deploy/.env`; generate fresh PostgreSQL,
   JWT and internal-RPC secrets and configure both OAuth providers. Keep
   `TRQSH_BASE_DOMAIN=trqsh.uz`; API/dashboard/QR public URLs are already set.
2. Keep the optional admin console disabled unless it is needed. Never expose
   container ports 8080, 5432, 6379 or 9090 on a public host interface.
3. Merge the reviewed PR only after required checks pass. Wait for the Images
   workflow for that exact commit, then set `TRQSH_IMAGE_TAG=sha-<short-SHA>` from
   its published metadata. `main` is available for development but is mutable.
   Images come from `ghcr.io/trqsh-tunnel/{api,edge,site,dashboard,migrate}`.
4. With secrets supplied locally, validate the Compose configuration, pull those
   pinned images, run the existing migration service and bring up the stack.
   Check TLS and health before enabling public sign-in.
5. Register the intended single edge in `TRQSH_REGIONS`. The example advertises
   `trqsh.uz:4443`; it does not promise unavailable regional servers.
6. Run `node deploy/verify-public.mjs`. It checks the separate production origins,
   provider discovery, login UI, public assets and restricted API surfaces.
7. Complete one real GitHub login and one real Google login, logout, and CLI
   `/login` device approval. These live checks need actual OAuth apps and DNS;
   mocked provider tests do not replace them.

Production startup fails when OAuth is unconfigured, credentials are partial,
development auth is enabled, or API/dashboard origins are unsafe. Passwordless
email test endpoints require an explicit development flag and have no public
dashboard form or server action. They remain forbidden in production even if
the flag is accidentally enabled.

## Existing accounts and data

Migration `00006_oauth_subject.sql` adds permanent provider identity binding and
case-insensitive email uniqueness. Before applying it to an existing database,
back it up and inspect duplicate `lower(email)` values; conflicting data must
be reviewed rather than silently merged. Fresh databases need no cleanup.

Existing accounts without a stored provider subject need an explicit
operator-reviewed migration with proof of the original provider identity. Do not
infer that identity from email alone, including for older OAuth accounts. A
different provider or subject cannot claim the same email address. Email-only
development accounts also require review. Never bulk-mark them verified.

If reusing a database from an email-only public deployment, rotate the JWT
signing secret to invalidate old sessions and review/revoke API keys issued
under those unverified accounts. A fresh server/database starts without them.

## Release the updated packages

The npm package name remains `@trqsh-uz/trqsh`, the Python package remains
`trqsh`, and the Go module name stays compatible. Public homepage/docs URLs,
download repositories, desktop links and native hosted defaults change.

CLI **0.2.6** must be published from the tested revision before deploying the
website's 0.2.6 download links or asking users to upgrade. Follow the existing
`package-v0.2.6` release workflow with the required npm/PyPI and cross-repository
release credentials. This preparation does not create that tag or publish a
registry release. Refresh Scoop/winget manifests from the resulting release's
real checksums; never invent them or replace an existing registry version.

Saved `tunnel.trqsh.uz` hosted defaults migrate to `api.trqsh.uz` and
`trqsh.uz:4443`. Custom servers, explicit environment/CLI overrides, stored API
keys and saved tunnels are preserved. The previous Cloudflare single-origin
deployment is historical; do not use its `/dashboard` callback URLs for these
OAuth applications.

References: [GitHub OAuth setup](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app),
[GitHub authorization and PKCE](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps),
[GitHub verified emails](https://docs.github.com/en/rest/users/emails#list-email-addresses-for-the-authenticated-user),
[Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

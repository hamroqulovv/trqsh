# TRQSH.UZ domain and authentication update

Date: 2026-10-20. Deployment preparation; no production rollout or package
publication is performed by this change.

The website uses `trqsh.uz`, the dashboard `app.trqsh.uz`, the API
`api.trqsh.uz`, and customer tunnel hosts `*.trqsh.uz`. CLI hosted defaults
use `trqsh.uz:4443` and the API origin above. Existing `tunnel.trqsh.uz`
defaults migrate; explicit self-hosted settings and credentials are preserved.

The dashboard supports GitHub/Google only. Email-only forms, automatic
registration actions and client helpers were removed. Development API test auth
is opt-in, and production rejects it regardless of the flag. Production
configuration requires a complete OAuth provider, secure public origins and
non-default strong secrets.

OAuth now requires verified provider email and an immutable provider identity.
GitHub public profile email does not replace `/user/emails` verification.
Google missing verification claims fail closed. PKCE S256 and provider-bound
browser proof supplement the existing single-use state and dashboard exchange.
OAuth cookies use `__Host-` in production to prevent sibling tunnel hosts from
injecting them. Existing accounts without stored subjects require reviewed
migration. Migration `00006_oauth_subject.sql` adds provider identity and
case-insensitive email uniqueness.

Public provider discovery has its own minimal endpoint because verbose
`/status` remains disabled in production. OpenAPI copies are synchronized.
Source, installer, desktop-update and GHCR URLs use `trqsh-tunnel`.
The npm/PyPI/native 0.2.6 release is prepared but not published.

Validation covers provider verification failure cases, PKCE transmission,
missing/wrong browser bindings, stable identities, email collision rejection,
production config, cookie isolation, memory/PostgreSQL persistence and native
endpoint migration. Full Go tests, vet/build, dashboard/site/desktop builds,
package installer regressions and Compose checks are run for this revision.
Live provider sign-in, real DNS/TLS, and new-server deployment require the
operator setup in [DOMAIN-AUTH.md](../../deploy/DOMAIN-AUTH.md).

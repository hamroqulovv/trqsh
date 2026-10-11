# Documentation source index

This directory contains user-facing website guides, the Control API contract and
repository development notes. User guides describe current implementation, including
limitations; architecture plans and build logs describe design/history and should not
be presented as proof that a feature is deployed.

## User guides

The website serves Markdown from content/ at /docs/<slug>.

| Guide | Scope |
| --- | --- |
| [Quickstart](content/quickstart.md) | App readiness, login, first URL, verification and stopping. |
| [Installation](content/installation.md) | npm/Python/shell/manual downloads, versions and removal. |
| [Authentication](content/authentication.md) | Device approval, keys, persistence, rotation and logout. |
| [Dashboard](content/dashboard.md) | Cloud resources, effective plan, usage and available screens. |
| [HTTP tunnels](content/http-tunnels.md) | HTTP targets, protection, Host headers and streaming. |
| [TCP & UDP](content/tcp-udp-tunnels.md) | Raw services, assigned ports and network requirements. |
| [Reserved subdomains](content/reserved-subdomains.md) | Ownership, names, limits and release. |
| [Custom domains](content/custom-domains.md) | DNS instructions, verification and HTTP binding. |
| [CLI reference](content/cli-reference.md) | Current slash commands, root flags, aliases and lifecycle. |
| [Configuration](content/configuration.md) | Real YAML schema, defaults, overrides and applying changes. |
| [Inspector](content/inspector.md) | Local capture limits, replay and retention. |
| [Desktop](content/desktop-gui.md) | Local agent UI, shortcuts, sign-in and exit behavior. |
| [QR remote control](content/remote-control.md) | Pairing, capabilities, lifetime and viewer commands. |
| [Webhooks & CI](content/webhooks-ci.md) | Provider delivery and job-owned headless automation. |
| [Self-hosting](content/self-hosting.md) | Full local stack, ports, agent settings and public hosting. |
| [Local agent API](content/local-api.md) | Loopback endpoints, tokens, curl/PowerShell examples. |
| [Troubleshooting](content/troubleshooting.md) | App/auth/transport/ingress diagnostic sequence. |
| [Security & privacy](content/security.md) | Encryption boundaries, credentials, captures and reporting. |

The bespoke /docs/api page renders the checked-in OpenAPI contract.
The /docs/errors page renders the stable code set in web/site/lib/errors.ts.

## Sources to verify against

| Subject | Implementation |
| --- | --- |
| Current console commands | internal/agent/cli/tui/commands.go |
| Shell launcher/root options | internal/agent/cli/cli.go |
| Configuration/default endpoints | internal/agent/config.go and version.go |
| Credential persistence/cloud proxy | internal/agent/core.go and cloudapi.go |
| Local API | internal/agent/localapi.go |
| Capture capacity/body limit/replay | internal/agent/core.go and inspect/ |
| Edge protocol/routing behavior | internal/server/ |
| Hosted routes and authentication | internal/api/server.go and auth/ |
| Plan limits | internal/billing/plans.go |
| DNS instructions | internal/api/handlers_resources.go |
| Desktop behavior | desktop/src/ and desktop/src-tauri/ |
| Local ports/build origins | deploy/docker-compose.local.yml |

Do not infer a working capability from a field name or a plan allowance. For example,
TLS protocol identifiers, cloud-inspector retention and desktop update UI each need
their actual forwarding/storage/install path checked.

## Editing website guides

1. Edit the matching content/<slug>.md.
2. Add/update its title and description in web/site/lib/docs-nav.ts.
3. Keep examples executable in the stated environment. Distinguish shell commands
   from slash commands inside the interactive console.
4. Use placeholders for secrets, assigned hosts and resource IDs. Explain where
   the user obtains each value.
5. Use H2/H3 headings for section navigation and keep existing anchors stable when
   possible. Relative website links should use /docs/<slug>#section.
6. Check internal links, anchors, code copying, responsive tables and theme contrast.
7. Build the website. Existing standalone images carry Markdown inside the image,
   so editing the host files alone does not update a running container.

The docs sidebar, generated Markdown routes, previous/next links and sitemap all
derive from docs-nav.ts. Additions must be registered there.

## OpenAPI synchronization

The canonical source is [openapi.yaml](openapi.yaml). The API embeds
internal/api/openapi.yaml; the website reads web/site/lib/openapi.generated.yaml.

After correcting the source contract, keep the embedded copy identical:

~~~powershell
Copy-Item -LiteralPath docs/openapi.yaml -Destination internal/api/openapi.yaml
~~~

The website generation script fetches a running API:

~~~powershell
$env:TRQSH_API_URL = "http://localhost:8081"
node web/site/scripts/gen-openapi.mjs
~~~

Use an API built from the same source revision. When the contract has been edited
but that backend has not yet been rebuilt, synchronize the website copy directly:

~~~powershell
Copy-Item -LiteralPath docs/openapi.yaml -Destination web/site/lib/openapi.generated.yaml
~~~

Do not fetch an older deployed contract over newly edited source definitions. The
website /openapi.yaml route deliberately returns the deployed backend's contract,
while /docs/api is built from the checked-in reference. Rebuilding the site does not
replace an API container's embedded specification.

CI compares the website and embedded OpenAPI copies with the source contract in
the same revision. This check works offline and does not depend on a branch being
deployed first. The separate pricing-catalog check uses the configured live API.

## Validation and local deployment

In web/site:

~~~sh
pnpm typecheck
pnpm build
~~~

For the existing persistent local stack, from the repository root:

~~~sh
docker compose -p trqsh-local -f deploy/docker-compose.dev.yml -f deploy/docker-compose.local.yml --profile web build site
docker compose -p trqsh-local -f deploy/docker-compose.dev.yml -f deploy/docker-compose.local.yml --profile web up -d --no-build --no-deps --wait site
~~~

Check http://localhost:3004/docs. This service-specific workflow retains database
volumes and does not recreate the API, edge, dashboard or unrelated projects.

## Repository and operator docs

- [DEVELOPMENT.md](DEVELOPMENT.md): toolchains, local/native workflows and checks.
- [Deployment](../deploy/README.md): Compose overlays and infrastructure.
- [Production](../deploy/PRODUCTION.md): production configuration and operations.
- [Security policy](../SECURITY.md): vulnerability reporting and operator controls.
- [Security hardening](SECURITY-HARDENING.md): detailed engineering security notes.
- [Architecture plans](../plan/): design and shared contracts.
- [Build log](build-log/README.md): historical delivery notes.

# Contributing to trqsh

Thanks for your interest in improving trqsh. The whole stack — the agent/CLI, the edge, the
control plane, and billing — is **open source under Apache-2.0**, and contributions are welcome
across all of it.

## Development setup

Prerequisites (pinned in [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md)):

- **Go 1.25.8+** (see `go.mod`)
- **Node 24 + pnpm 10** (frontends)
- **Docker** (local stack, image builds)

```bash
make dev            # full local stack: postgres, redis, migrate, api, edge, mailhog
make build          # build all Go binaries
make test           # go test ./... -race
make lint           # golangci-lint
```

Run a public URL against a local server, no cloud needed:

```bash
# terminal 1 — edge (in-memory registry, stub entitlements)
TRQSH_ENTITLEMENTS=stub TRQSH_BASE_DOMAIN=lvh.me go run ./cmd/trqshd
# terminal 2 — agent
TRQSH_API_KEY=local-dev-key go run ./cmd/trqsh --server 127.0.0.1:4443 --insecure http 3000
curl -H 'Host: <sub>.lvh.me' http://127.0.0.1
```

Frontends:

```bash
cd web/site      && pnpm install && pnpm dev        # :3002
cd web/dashboard && pnpm install && pnpm dev        # :3000
cd desktop       && pnpm install && pnpm tauri dev  # native desktop app (Tauri v2)
```

## Ground rules

- **Frozen contracts.** The shared contracts in [`plan/00-ARCHITECTURE.md`](./plan/00-ARCHITECTURE.md)
  (wire protocol, transport API, `authz.Entitlements`, config schema, error taxonomy, plan catalog)
  change only by editing that file first. Don't drift them.
- **Generated code stays in sync.** After editing the plan catalog run `make site-plans`; after
  editing OpenAPI, sync `docs/openapi.yaml` to the backend and site's contract copies as
  described in [docs/README.md](docs/README.md). `make openapi-sync` copies the backend
  file; `make site-openapi` fetches a running API's contract, so use a server built from
  the same source revision. Do not overwrite a new contract with an older deployed one.
- **Match the surrounding style.** Go is `gofmt`/`goimports`-clean; TS mirrors Go JSON tags in
  **snake_case** (the Go APIs marshal with `encoding/json`, so the TS shapes track the Go field tags).

## Before you open a PR

```bash
gofmt -l .          # must print nothing
go vet ./...
go build ./... && go test ./...
```

- Keep changes focused; add tests for behavior changes.
- Never commit secrets. Real values come from the environment / SOPS, never source.
- Update docs and the relevant `docs/build-log/` entry when behavior changes.

## Reporting security issues

Do **not** file public issues for vulnerabilities — see [`SECURITY.md`](./SECURITY.md).

## Commit messages

Conventional, imperative present tense (`add edge drain timeout`, `fix quota off-by-one`). Group
related changes; explain the *why* in the body when non-obvious.

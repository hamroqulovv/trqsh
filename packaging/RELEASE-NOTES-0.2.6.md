## CLI 0.2.6 — TRQSH.UZ deployment candidate

This version is prepared in source and is not published by this PR.

- Use `https://api.trqsh.uz` for account and OAuth device APIs.
- Connect to `trqsh.uz:4443` with QUIC and TCP fallback; customer tunnel URLs
  are under `*.trqsh.uz`.
- Migrate the previous `tunnel.trqsh.uz` hosted defaults while preserving
  custom endpoints, explicit overrides, API keys and saved tunnels.
- Point homepage/docs links at `https://trqsh.uz`, dashboard links at
  `https://app.trqsh.uz`, and release downloads at `trqsh-tunnel/trqshcli`.
- Keep existing npm, PyPI and Go module names compatible.

Publish the tested native assets and matching npm/PyPI 0.2.6 wrappers only after
the new domain, trusted TLS and GitHub/Google sign-in are ready. See
[the deployment guide](../deploy/DOMAIN-AUTH.md).

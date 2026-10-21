## CLI 0.2.6 — trqsh.uz

- Uses `https://api.trqsh.uz` for account and OAuth device sign-in. Sign-in is
  GitHub or Google only, at `https://app.trqsh.uz`.
- Connects to `trqsh.uz:4443` with QUIC and TCP fallback; tunnel URLs are
  `https://<name>.trqsh.uz`.
- Migrates the previous `tunnel.trqsh.uz` hosted defaults automatically while
  preserving custom endpoints, explicit overrides, API keys and saved tunnels.
- Homepage and docs links point at `https://trqsh.uz`, dashboard links at
  `https://app.trqsh.uz`, and release downloads at `trqsh-tunnel/trqshcli`.
- Windows has a PowerShell installer: `irm https://trqsh.uz/install.ps1 | iex`.
- npm (`@trqsh-uz/trqsh`), PyPI (`trqsh`) and Go module names are unchanged.

Update with `trqsh update`, your package manager, or the installers at
https://trqsh.uz/docs/installation.

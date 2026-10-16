## CLI 0.2.5

- Replace cached native binaries older than the npm/PyPI package; preserve
  newer self-updates and honor explicit version pins.
- Detect a Windows global npm command shadowed by another trqsh installation
  and report the conflicting launcher with instructions to switch.
- Restart older CLI daemons when opening an updated console, so login and
  tunnel connections use the new agent. Authenticate before stopping an agent;
  desktop-owned agents are left to their owning app.
- Migrate saved hosted defaults `https://api.trqsh.uz` and `trqsh.uz:4443` to
  `https://tunnel.trqsh.uz` and `wss://tunnel.trqsh.uz/_trqsh/agent`.
  Custom endpoints, explicit overrides, credentials and saved tunnels remain.
- Correct the console's base-domain display for WebSocket server URLs.

```sh
npm install -g @trqsh-uz/trqsh@0.2.5 --foreground-scripts
python -m pip install --upgrade trqsh==0.2.5
```

Choose one package manager for the global `trqsh` command. If switching from
pip to npm, remove the old Python launcher with `python -m pip uninstall trqsh`.
Installing locally with npm does not update a global command.

This package release contains CLI downloads and npm/PyPI wrappers. Public
tunnel URLs still require wildcard DNS/TLS and ingress for `*.tunnel.trqsh.uz`.

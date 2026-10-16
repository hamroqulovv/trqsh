## CLI 0.2.4

- Connect through Cloudflare HTTP tunnels with authenticated WebSocket + yamux
  transport, using normal HTTPS on port 443.
- Default API: `https://tunnel.trqsh.uz`.
- Default agent endpoint: `wss://tunnel.trqsh.uz/_trqsh/agent`.
- Direct QUIC/TCP endpoints remain available through `--server host:port`.
- Download and self-update URLs now use `trqsh-tunnel/trqshcli`; signature
  verification recognizes the new source owner and CLI package release tags.

This release contains native CLI archives, checksums/signature, and npm/PyPI
wrappers. The server must enable `TRQSH_WEBSOCKET_ADDR` behind the HTTPS proxy.
Public tunnel URLs still require wildcard DNS, TLS, and ingress routing for
`*.tunnel.trqsh.uz`; an HTTPS control-plane hostname alone does not configure it.

```sh
npm install -g @trqsh-uz/trqsh@0.2.4
python -m pip install --upgrade trqsh==0.2.4
```

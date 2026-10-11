# QR remote control

Pair your running trqsh console with a phone or another browser. The viewer receives a live console transcript/state and can send allowed console commands.

This differs from sharing a QR that simply opens a tunnel URL.

## Pair the console

1. Open trqsh in a terminal and sign in.
2. Enter `/qr`.
3. Scan the printed QR, or open the **printed viewer URL** in a browser.
4. Keep the console open while using the remote viewer.

The printed URL reflects the deployment's configured QR origin. Hosted and local installations may use different hosts or paths; prefer that full URL over guessing `qr.trqsh.uz`.

The console also displays a short pairing code. Enter it on the deployment's remote page when scanning is unavailable.

## What the viewer can do

The remote viewer mirrors recent transcript lines and shows connection/tunnel state. Commands run through the paired console, for example:

~~~text
/status
/ls
/http 3000
/stop TUNNEL_ID
~~~

It is a trqsh command interface, **not a general operating-system shell**. Starting an HTTP tunnel does not start the HTTP app itself.

The console blocks remote credential, binary and lifecycle actions: `login`, `logout`, `update`, `uninstall`, `down`, `quit` and `qr`, including aliases that resolve to them.

## Access and lifetime

The pairing code/URL is the viewer's access capability. Viewers do not need a separate login. Anyone holding that link can view shared console information and issue allowed commands while the pairing is active.

The current pairing lifetime is **30 minutes**. Run `/qr` again for a fresh pairing when necessary; a new pairing replaces the daemon's previous one.

The relay keeps up to 200 recent transcript lines and the last state snapshot in the API process. Pairings do not survive an API restart. The local console must remain attached to execute remote input.

## End the pairing

On the local console:

~~~text
/qr stop
~~~

This ends the pairing without stopping your app or its tunnels. To stop tunnels separately, use `/stop`; to stop the standalone daemon, use `/down`.

## A QR for a public tunnel

To show a QR that opens one tunnel's URL:

~~~text
/ls
/qr TUNNEL_ID
~~~

That QR grants access to the public service under its normal authentication rules. It does not pair the viewer with your console.

## Local network considerations

In the local Docker stack, the printed viewer URL normally uses `localhost:3005/remote`. A phone's `localhost` refers to the phone, so a loopback-only URL cannot be reached from it.

Use a properly configured public dashboard origin or a deliberately configured reachable development origin if you need another device to connect. Do not expose port 4041 or the inspector to make QR pairing work; remote viewers connect to the Control API relay.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Pairing fails immediately | Sign in and verify Control API connectivity. |
| Viewer says expired/not found | Start a new pairing; the API may have restarted or the code expired. |
| Viewer receives state but commands fail | Keep the local console open and attached. |
| HTTP 409 when sending a command | No console is currently attached to that session. |
| Phone cannot open the URL | Check whether it points to loopback or a private unreachable origin. |
| Multiple API replicas behave inconsistently | The current relay is process-local; use a compatible single-instance/routing setup. |

See [Security](/docs/security) before sharing a pairing link.

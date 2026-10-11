# Request inspector

Inspect HTTP exchanges on the computer running the agent. The browser inspector defaults to `http://127.0.0.1:4040`; the desktop app also reads the local agent's capture buffer.

## Start and view captures

1. Start a local HTTP app.
2. Create an HTTP tunnel.
3. Send a request to its assigned public URL.
4. Open `http://127.0.0.1:4040` on the **agent computer**.
5. Select a captured request.

Inside the trqsh console, use `/requests` for recent exchanges or `/pin traffic` for a live panel.

`localhost` on your phone refers to your phone, not your computer. Use [QR remote control](/docs/remote-control) for console access from a phone; the inspector itself stays local.

## Captured information

Normal HTTP exchanges include:

- Method, hostname, path and query string.
- Response status, start time and elapsed time.
- Request and response headers.
- Bounded copies of request and response bodies.
- Tunnel ID and local destination.

The recorder holds **up to 256 exchanges in memory**. New captures replace the oldest ones. Each request body and response body is limited to **64 KiB** of stored capture data; forwarding itself continues beyond that limit.

Bodies returned by the JSON APIs are Base64-encoded because the stored fields are byte arrays. The UI handles that representation.

## Replay

Select a request and choose **Replay**, or call the inspector's replay endpoint. Replay sends the captured method, path, headers and retained body to the recorded local HTTP destination and adds the result to the recorder.

Replay runs the handler again. A POST may create another record, send another email or repeat another side effect. Use test data and idempotency controls where applicable.

A body larger than 64 KiB is truncated in the capture, so replay cannot reproduce its full original payload. Replay is aimed at the recorded local HTTP address; it is not a new request through the public edge.

## Local inspector endpoints

| Method and path | Purpose |
| --- | --- |
| `GET /api/requests` | List retained captures, newest first. |
| `GET /api/requests/{id}` | Fetch one capture. |
| `POST /api/requests/{id}/replay` | Replay it against its recorded local address. |
| `GET /api/stream` | Live capture stream using server-sent events. |

These paths are on the **inspector listener**, normally port 4040. The agent control API on port 4041 has a separate `GET /requests` and `DELETE /requests` interface. See [Local agent API](/docs/local-api).

## Change or disable the listener

~~~yaml
inspector:
  enabled: true
  addr: "127.0.0.1:4050"
~~~

Set `enabled: false` to stop serving the browser inspector. Restart the agent after changing the config. The core's in-memory recording can still be used by the console and desktop app; disabling this listener is not a switch to stop all capture recording.

`TRQSH_INSPECTOR_ADDR` also overrides the listener address. Keep it on loopback because captures can contain credentials and private payloads.

## Retention and cloud availability

Local captures are not a time-based archive: they disappear when the agent stops and are overwritten as the buffer fills. Your plan's listed inspector-history allowance does not turn this local buffer into persistent storage.

The current dashboard has a cloud-inspector page, but its capture relay/storage integration is not implemented. Use the local browser inspector or desktop inspector for working captures and replay. Normal local recording does not automatically upload those HTTP bodies to a cloud archive.

## Limitations and common issues

- Raw TCP/UDP traffic and WebSocket frames are not HTTP capture entries.
- Failed upstream connections can produce an agent error before a completed capture exists.
- Long-lived responses may appear only after they finish.
- If the browser cannot connect, check the daemon and inspector address.
- If a port is already occupied, choose another loopback port and restart.

See [Troubleshooting](/docs/troubleshooting) for the full diagnostic sequence.

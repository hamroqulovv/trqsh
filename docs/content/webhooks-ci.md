# Webhooks & CI

Receive provider events on a local HTTP service, or manage a tunnel from an automated job. Interactive console commands and headless automation use different interfaces.

## Receive a webhook locally

Start your webhook handler locally, then reserve a stable name and start its tunnel:

~~~text
/subdomains reserve my-webhook
/http 3000 --subdomain my-webhook
~~~

Configure the provider with the **actual assigned HTTPS URL plus your handler path**, for example `https://YOUR-ASSIGNED-HOST/webhooks/provider`.

The tunnel forwards to your app; it does not validate the provider's webhook signature. Your handler should verify the signature using the provider's secret and original request body.

## Test before enabling provider events

Use an endpoint your app implements:

~~~sh
curl -i -X POST https://YOUR-ASSIGNED-HOST/webhooks/provider \
  -H "Content-Type: application/json" \
  -d '{"event":"local-test"}'
~~~

A signature-verifying handler should reject this unsigned test unless you explicitly support a local test mode. Use the provider's test-event tool for a signed end-to-end check.

Watch `/pin traffic` or open the [local inspector](/docs/inspector). Confirm the method, path, content type and response status before diagnosing a provider delivery problem.

## Replay and stable URLs

Replay a captured request while iterating on the handler. Replayed POSTs can repeat side effects, and stored bodies larger than 64 KiB are truncated.

A [reserved subdomain](/docs/reserved-subdomains) survives restarts; the actual tunnel still has to be running. Without a reservation, update the provider whenever the assigned hostname changes.

HTTP Basic Auth can interfere with provider deliveries that cannot supply those credentials. Verify webhook signatures in the application instead of assuming a browser-oriented access prompt fits every provider.

## Choose the right automation interface

The current `trqsh http 8080` launcher opens an interactive console and requires a terminal. Running it with `&` in CI or piping its output does not create a supported noninteractive workflow.

For headless integration, run the agent daemon and call its authenticated [local control API](/docs/local-api). This API starts/stops tunnels and returns their actual public URLs as JSON. The hosted Control API manages account resources; it does not launch a service on your CI runner.

The following example uses the daemon entry point intended for local integrations. Use the same CLI build as the local API documentation and test it in your runner environment.

## Minimal CI example

Requirements: Bash, curl, jq, an installed trqsh binary, a running HTTP app on port 8080, and a dedicated `TRQSH_API_KEY` secret already injected by your CI platform.

Run on an isolated job runner with the chosen loopback ports free:

~~~bash
set -euo pipefail

export TRQSH_CONFIG="$(mktemp -d)/trqsh.yml"
export TRQSH_CONTROL_ADDR="127.0.0.1:4071"
export TRQSH_INSPECTOR_ADDR="127.0.0.1:4070"

trqsh --log json daemon >"$(dirname "$TRQSH_CONFIG")/daemon.log" 2>&1 &
TRQSH_JOB_PID=$!
trap 'kill "$TRQSH_JOB_PID" 2>/dev/null || true; wait "$TRQSH_JOB_PID" 2>/dev/null || true' EXIT

for attempt in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:4071/healthz >/dev/null; then
    break
  fi
  sleep 1
done

curl -fsS --max-time 2 http://127.0.0.1:4071/healthz >/dev/null
TRQSH_LOCAL_TOKEN="$(cat "$(dirname "$TRQSH_CONFIG")/control.token")"

TRQSH_RESULT="$(curl -fsS --max-time 40 \
  -H "Authorization: Bearer $TRQSH_LOCAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"ci-preview","proto":"http","addr":"localhost:8080"}' \
  http://127.0.0.1:4071/tunnels)"

TRQSH_PREVIEW_URL="$(printf '%s' "$TRQSH_RESULT" | jq -er '.public_url')"
curl -fsS --max-time 20 "$TRQSH_PREVIEW_URL/health"
~~~

Replace `/health` with a route that confirms **your app** is ready. Export/write `TRQSH_PREVIEW_URL` through your CI platform's output mechanism when later steps need it.

The trap stops only the daemon started by this job. Keep its temporary config/token/log directory private and do not upload it as a public artifact. On persistent runners, remove it according to your runner's cleanup policy.

## Named CI previews and concurrency

If you add `subdomain` to the JSON body, reserve that exact name under the job key's account first. A generated PR name is not automatically reserved. Parallel jobs cannot bind the same public hostname at once.

Use a separate API key for CI. Account-wide tunnel and bandwidth quotas still apply. For self-hosted runners, set `TRQSH_API_URL` and `TRQSH_SERVER` to the same deployment before starting the daemon.

## Cleanup and failures

- Check the local app before starting the tunnel.
- Wait for the bind response and app readiness before running remote tests.
- Always stop the job-owned agent when the job finishes.
- Do not use `/stop all` or a shared daemon on a runner hosting unrelated work.
- If the API succeeds but the public request fails, check edge connectivity and the app's allowed-host settings.

See [Local agent API](/docs/local-api) for a PowerShell example and [Troubleshooting](/docs/troubleshooting) for diagnostic steps.

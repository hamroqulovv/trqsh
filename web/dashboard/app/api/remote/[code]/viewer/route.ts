import { forwardedFor, normalizePairingCode } from "@/lib/remote";

const API = process.env.TRQSH_API_INTERNAL_URL || process.env.TRQSH_API_URL || "https://api.trqsh.uz";

const json = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

// Proxies the /qr pairing viewer's SSE stream so the browser only ever talks
// to this same origin, never api.<base> directly — the same "never call the
// cloud directly" boundary the desktop app's local API already keeps for its
// WebView (see internal/agent/cloudapi.go), applied here for the public web
// viewer instead of a native WebView. Long-lived by design: this deployment
// runs as a persistent `next start` Node process (see deploy/docker-compose),
// not a request-scoped serverless function, so streaming through it is fine.
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = normalizePairingCode((await params).code);
  if (!code) return json(404, "session not found or expired");

  let upstream: Response;
  try {
    // req.signal aborts the upstream stream when the browser goes away.
    // Without it the relay would keep this viewer registered (and count it
    // against the session's viewer cap) until the session ended.
    upstream = await fetch(`${API}/v1/remote/sessions/${code}/viewer`, {
      headers: { Accept: "text/event-stream", ...forwardedFor(req) },
      cache: "no-store",
      signal: req.signal,
    });
  } catch {
    return json(502, "relay unreachable");
  }

  if (!upstream.ok || !upstream.body) {
    // Pass the status through (404 unknown/expired, 429 full or throttled),
    // but never relay an arbitrary upstream body or content type.
    await upstream.body?.cancel().catch(() => {});
    return json(upstream.status === 429 ? 429 : upstream.status === 404 ? 404 : 502, "session unavailable");
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

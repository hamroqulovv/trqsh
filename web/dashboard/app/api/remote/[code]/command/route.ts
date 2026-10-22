import { forwardedFor, normalizePairingCode } from "@/lib/remote";

const API = process.env.TRQSH_API_INTERNAL_URL || process.env.TRQSH_API_URL || "https://api.trqsh.uz";

// A command is at most 240 bytes (internal/api/remote.go); the JSON envelope
// around it is small. Anything larger is not a command.
const MAX_BODY = 2048;

const json = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

// Proxies a command typed/tapped in the /qr viewer to the control plane —
// same-origin boundary as the viewer SSE route (see its sibling route.ts).
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = normalizePairingCode((await params).code);
  if (!code) return json(404, "session not found or expired");

  const body = await req.text();
  if (body.length > MAX_BODY) return json(413, "command too large");

  let upstream: Response;
  try {
    upstream = await fetch(`${API}/v1/remote/sessions/${code}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...forwardedFor(req) },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return json(502, "relay unreachable");
  }
  const text = await upstream.text();
  return new Response(text || null, {
    status: upstream.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

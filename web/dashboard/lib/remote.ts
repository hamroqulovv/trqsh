// Shared helpers for the /qr remote-control viewer and its same-origin proxy
// routes (app/api/remote). Mirrors the pairing-code shape in
// internal/api/remote.go (canonicalRemoteCode): the code is the viewer's whole
// credential, so anything that is not a code is rejected before it is placed
// in a URL.

const ALPHABET = "BCDFGHJKLMNPQRSTVWXZ0123456789";
const CODE_CHARS = 12;

// normalizePairingCode turns what a person typed or a link carried (any case,
// optional dashes or spaces) into the canonical XXXX-XXXX-XXXX form, or null
// when it cannot be a pairing code.
export function normalizePairingCode(raw: string): string | null {
  if (raw.length > 32) return null;
  const chars = raw.toUpperCase().replace(/[\s-]/g, "");
  if (chars.length !== CODE_CHARS) return null;
  for (const c of chars) if (!ALPHABET.includes(c)) return null;
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

// safeHttpURL returns url only when it is an absolute http(s) URL. A tunnel
// address from the relay is rendered as a link; a javascript: or data: URL
// there would run in the viewer's origin.
export function safeHttpURL(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

// forwardedFor builds the X-Forwarded-For header for a proxied request so the
// control plane rate-limits the real viewer, not this server (which would put
// every viewer in one shared bucket). Only the header the edge already set is
// passed on; nothing is invented.
export function forwardedFor(req: Request): Record<string, string> {
  const xff = req.headers.get("x-forwarded-for");
  return xff ? { "X-Forwarded-For": xff } : {};
}

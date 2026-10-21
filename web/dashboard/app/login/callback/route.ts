import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { setTokens, type Tokens } from "@/lib/session";
import { oauthCookie, secureSession } from "@/lib/session-config";
import { dashboardPath, safeDashboardNextPath } from "@/lib/paths";

export async function GET(req: NextRequest) {
  const state = req.nextUrl.searchParams.get("state") || "";
  const expected = req.cookies.get(oauthCookie)?.value || "";
  const code = req.nextUrl.searchParams.get("code") || "";
  let destination = "/login?error=oauth";
  if (/^[a-f0-9]{64}$/.test(state) && /^[a-f0-9]{64}$/.test(expected) && /^[a-f0-9]{64}$/.test(code) &&
      timingSafeEqual(Buffer.from(state), Buffer.from(expected))) {
    try {
      const base = process.env.TRQSH_API_INTERNAL_URL || process.env.TRQSH_API_URL || "https://api.trqsh.uz";
      const exchange = await fetch(`${base}/v1/auth/dashboard/exchange`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, state }), cache: "no-store", signal: AbortSignal.timeout(10000),
      });
      if (exchange.ok) {
        const login = await exchange.json() as { tokens: Tokens; next: string };
        await setTokens(login.tokens);
        destination = safeDashboardNextPath(login.next);
      }
    } catch { /* A failed exchange returns to login without creating a session. */ }
  }
  // Relative Location: the browser resolves it against the public origin it is
  // on. Behind the edge, req.url is the container's own http://localhost:3000.
  const response = new NextResponse(null, { status: 307, headers: { Location: dashboardPath(destination) } });
  response.cookies.set(oauthCookie, "", { httpOnly: true, secure: secureSession, sameSite: "lax", path: "/", maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

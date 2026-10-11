import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { oauthCookie, secureSession } from "@/lib/session-config";
import { safeDashboardNextPath } from "@/lib/paths";

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!["github", "google"].includes(provider)) return new NextResponse("Unknown provider", { status: 404 });
  const state = randomBytes(32).toString("hex");
  const url = new URL(`${process.env.TRQSH_API_URL || "https://api.trqsh.uz"}/v1/auth/oauth/${provider}`);
  url.searchParams.set("dashboard_state", state);
  url.searchParams.set("next", safeDashboardNextPath(req.nextUrl.searchParams.get("next") || "/"));
  const response = NextResponse.redirect(url);
  response.cookies.set(oauthCookie, state, { httpOnly: true, secure: secureSession, sameSite: "lax", path: "/", maxAge: 600 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

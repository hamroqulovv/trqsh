import { NextResponse } from "next/server";
import { clearTokens } from "@/lib/session";
import { dashboardPath } from "@/lib/paths";

// Where the dashboard sends a session the API no longer accepts. Redirecting
// straight to /login would loop: middleware sends anyone who still has session
// cookies away from /login, and the layout would send them back. Clearing the
// cookies first ends that.
export async function GET() {
  await clearTokens();
  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: dashboardPath("/login?error=expired") },
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

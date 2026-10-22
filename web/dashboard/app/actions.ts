"use server";

import { redirect } from "next/navigation";
import { revokeRefreshToken } from "@/lib/api";
import { dashboardRedirectURL } from "@/lib/paths";
import { clearTokens, getTokens } from "@/lib/session";

export async function logout() {
  // Revoke the refresh token on the API first; clearing cookies alone would
  // leave a copy of it valid for its full lifetime.
  const { refresh } = await getTokens();
  if (refresh) await revokeRefreshToken(refresh);
  await clearTokens();
  redirect(dashboardRedirectURL("/login"));
}

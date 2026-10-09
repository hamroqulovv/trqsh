"use server";

import { redirect } from "next/navigation";
import { dashboardRedirectURL } from "@/lib/paths";
import { clearTokens } from "@/lib/session";

export async function logout() {
  await clearTokens();
  redirect(dashboardRedirectURL("/login"));
}

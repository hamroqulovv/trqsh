"use server";

import { redirect } from "next/navigation";
import { dashboardRedirectURL } from "@/lib/paths";
import { api } from "@/lib/api";

export async function checkoutAction(fd: FormData): Promise<void> {
  const plan = String(fd.get("plan") || "");
  const cadence = String(fd.get("cadence") || "monthly");
  let url = "";
  try {
    const r = await api.checkout(plan, cadence);
    url = r.url;
  } catch {
    redirect(dashboardRedirectURL("/billing?error=checkout"));
  }
  redirect(url || dashboardRedirectURL("/billing?error=checkout"));
}

export async function portalAction(): Promise<void> {
  let url = "";
  try {
    const r = await api.portal();
    url = r.url;
  } catch {
    redirect(dashboardRedirectURL("/billing?error=portal"));
  }
  redirect(url || dashboardRedirectURL("/billing?error=portal"));
}

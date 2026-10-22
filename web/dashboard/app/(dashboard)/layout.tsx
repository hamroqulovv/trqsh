import { redirect } from "next/navigation";
import { dashboardRedirectURL } from "@/lib/paths";
import { api, isUnauthorized, safe, type Account } from "@/lib/api";
import { formatBytes, pctOf } from "@/lib/format";
import { Providers } from "@/components/providers";
import { Sidebar, type SidebarUsage } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { PageTransition } from "@/components/page-transition";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Both requests start together; the bandwidth meter is a nicety and never fails the page.
  const meterRequest = safe(api.usage());
  let account: Account;
  try {
    account = await api.account();
  } catch (error) {
    // Only a rejected session means "sign in again". If the API is down or slow
    // the account is fine, so show the error page instead of logging people out.
    if (isUnauthorized(error)) redirect(dashboardRedirectURL("/session/expired"));
    throw error;
  }

  const org = account.orgs.find((o) => o.id === account.active_org) ??
    account.orgs[0] ?? {
      id: "",
      name: "Your org",
      plan: "free",
      created_at: "",
    };

  const meter = await meterRequest;
  const limit = meter?.limits.bandwidth_bytes_mo ?? 0;
  const used = meter ? meter.usage.bytes_in + meter.usage.bytes_out : 0;
  const usage: SidebarUsage | null =
    meter && limit > 0
      ? { used: formatBytes(used), limit: formatBytes(limit), pct: pctOf(used, limit) }
      : null;

  return (
    <Providers>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="flex min-h-dvh">
        <Sidebar org={org} usage={usage} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar org={org} user={account.user} usage={usage} />
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none sm:px-6 lg:px-8 lg:py-10"
          >
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>
    </Providers>
  );
}

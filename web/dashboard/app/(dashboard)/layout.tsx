import { redirect } from "next/navigation";
import { dashboardRedirectURL } from "@/lib/paths";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { api, type Account } from "@/lib/api";
import { Nav } from "@/components/nav";
import { Topbar } from "@/components/topbar";
import { PageTransition } from "@/components/page-transition";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let account: Account;
  try {
    account = await api.account();
  } catch {
    redirect(dashboardRedirectURL("/login"));
  }

  const org = account.orgs.find((o) => o.id === account.active_org) ??
    account.orgs[0] ?? {
      id: "",
      name: "Your org",
      plan: "free",
      created_at: "",
    };

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <Link
          href="/"
          aria-label="trqsh overview"
          className="flex h-14 items-center px-5"
        >
          <Logo />
        </Link>
        <div className="py-2">
          <Nav />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar org={org} user={account.user} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}

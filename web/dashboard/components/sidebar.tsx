import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { Nav } from "@/components/nav";
import { PlanBadge } from "@/components/plan-badge";
import { Progress } from "@/components/ui/progress";
import { buttonVariants } from "@/components/ui/button";
import type { Org } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface SidebarUsage {
  used: string;
  limit: string;
  pct: number;
}

/** The organization this dashboard is acting on. */
export function OrgChip({ org }: { org: Org }) {
  return (
    <Link
      href="/settings"
      className="group mx-3 flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 transition-[border-color,background-color] duration-200 hover:border-border-strong hover:bg-accent/60"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-sm font-bold text-page transition-transform duration-500 [transition-timing-function:var(--ease-spring)] group-hover:-rotate-6 group-hover:scale-105">
        {(org.name || "?").charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-5">{org.name}</span>
        <span className="block text-xs leading-4 text-muted">Organization</span>
      </span>
      <PlanBadge plan={org.plan} />
    </Link>
  );
}

/** Bandwidth at a glance, with an upgrade path on the free plan. */
export function SidebarFooter({
  org,
  usage,
  className,
}: {
  org: Org;
  usage: SidebarUsage | null;
  className?: string;
}) {
  const tone = !usage ? "default" : usage.pct >= 100 ? "critical" : usage.pct >= 80 ? "warning" : "default";
  return (
    <div className={cn("flex flex-col gap-3 p-3", className)}>
      {usage && (
        <Link
          href="/usage"
          className="group rounded-xl border border-border p-3.5 transition-[border-color,background-color] duration-200 hover:border-border-strong hover:bg-accent/60"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="eyebrow">Bandwidth</span>
            <span className="text-xs tabular text-secondary">{usage.pct}%</span>
          </div>
          <Progress value={usage.pct} tone={tone} label="Bandwidth used" className="mt-3 h-1.5" />
          <p className="mt-2.5 text-xs tabular text-secondary">
            {usage.used} <span className="text-muted">of {usage.limit}</span>
          </p>
        </Link>
      )}
      {org.plan === "free" && (
        <Link href="/billing" className={buttonVariants({ size: "sm", className: "w-full" })}>
          Upgrade plan <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

export function Sidebar({ org, usage }: { org: Org; usage: SidebarUsage | null }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface/60 lg:flex">
      <Link href="/" aria-label="trqsh overview" className="flex h-16 shrink-0 items-center px-5">
        <Logo />
      </Link>
      <OrgChip org={org} />
      <div className="mt-6 min-h-0 flex-1 overflow-y-auto pb-4">
        <Nav />
      </div>
      <SidebarFooter org={org} usage={usage} className="border-t border-border" />
    </aside>
  );
}

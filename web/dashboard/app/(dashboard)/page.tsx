import Link from "next/link";
import { ArrowUpRight, BookOpen, Network, Terminal } from "lucide-react";
import { api, safe } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { StatTile, MeterTile } from "@/components/stat-tile";
import { SpotlightGroup } from "@/components/spotlight";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { PlanBadge } from "@/components/plan-badge";
import { StatusDot } from "@/components/status-dot";
import { InstallSteps } from "@/components/install-steps";
import { SetupChecklist } from "@/components/setup-checklist";
import { LoadError } from "@/components/load-error";
import { DOCS_URL } from "@/components/nav-config";
import { formatBytes, formatNumber, pctOf } from "@/lib/format";
import { stagger } from "@/lib/utils";

export default async function OverviewPage() {
  const [account, usage, subs, subdomains, domains, keys, tunnels] = await Promise.all([
    safe(api.account()),
    safe(api.usage()),
    safe(api.subscription()),
    safe(api.subdomains()),
    safe(api.domains()),
    safe(api.apiKeys()),
    safe(api.tunnels()),
  ]);

  // Zeros from a failed request look like real figures, so say when some are missing.
  const incomplete = [usage, subs, subdomains, domains, keys, tunnels].some((value) => value === null);
  const plan = subs?.plan ?? usage?.plan ?? "free";
  const bwUsed = (usage?.usage.bytes_in ?? 0) + (usage?.usage.bytes_out ?? 0);
  const bwLimit = usage?.limits.bandwidth_bytes_mo ?? 0;
  const bwPct = pctOf(bwUsed, bwLimit);
  const activeKeys = (keys ?? []).filter((k) => !k.revoked_at).length;
  const tunnelCount = (tunnels ?? []).length;
  const first = account?.user.name?.trim().split(/\s+/)[0] || account?.user.email.split("@")[0];

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Overview"
        description={first ? `Welcome back, ${first}. Here's your account at a glance.` : "Your account at a glance."}
        action={
          plan === "free" ? (
            <Link href="/billing" className={buttonVariants()}>
              Upgrade plan <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />

      {incomplete && <LoadError what="some of your figures" className="mb-6" />}

      <SpotlightGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MeterTile
          label="Bandwidth"
          used={formatBytes(bwUsed)}
          limitLabel={bwLimit ? formatBytes(bwLimit) : "∞"}
          pct={bwPct}
          note={bwLimit ? `${bwPct}% of monthly allowance` : "Metered"}
          style={stagger(0)}
        />
        <StatTile
          label="Requests"
          value={formatNumber(usage?.usage.requests ?? 0)}
          sub="This period"
          style={stagger(1)}
        />
        <StatTile
          label="Active tunnels"
          value={tunnelCount}
          icon={Network}
          sub={
            <span className="inline-flex items-center gap-2">
              <StatusDot state={tunnelCount > 0 ? "live" : "off"} />
              {tunnelCount > 0 ? "Live now" : "Nothing running"}
            </span>
          }
          style={stagger(2)}
        />
        <StatTile
          label="Plan"
          value={<PlanBadge plan={plan} />}
          sub={`${activeKeys} API key${activeKeys === 1 ? "" : "s"}`}
          style={stagger(3)}
        />
      </SpotlightGroup>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rise lg:col-span-2" style={stagger(4)}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-muted" aria-hidden="true" /> Quick start
            </CardTitle>
            <CardDescription>Expose a local service in under a minute.</CardDescription>
          </CardHeader>
          <CardContent>
            <InstallSteps />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <SetupChecklist
            style={stagger(5)}
            items={[
              {
                title: "Create an API key",
                hint: `${activeKeys} active`,
                href: "/keys",
                done: activeKeys > 0,
              },
              {
                title: "Reserve a subdomain",
                hint: `${(subdomains ?? []).length} reserved`,
                href: "/domains",
                done: (subdomains ?? []).length > 0,
              },
              {
                title: "Open a tunnel",
                hint: tunnelCount > 0 ? `${tunnelCount} live` : "Run trqsh http 3000",
                href: "/tunnels",
                done: tunnelCount > 0,
              },
              {
                title: "Add a custom domain",
                hint: `${(domains ?? []).length} added`,
                href: "/domains",
                done: (domains ?? []).length > 0,
              },
            ]}
          />
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rise group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-[border-color,background-color] duration-200 hover:border-border-strong hover:bg-accent/60"
            style={stagger(6)}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Read the docs</span>
              <span className="block truncate text-xs text-secondary">Guides, CLI reference and the API</span>
            </span>
            <ArrowUpRight
              className="h-4 w-4 shrink-0 text-muted transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </div>
    </div>
  );
}

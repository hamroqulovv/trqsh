import Link from "next/link";
import { ArrowUpRight, CalendarClock, TriangleAlert } from "lucide-react";
import { api, safe, type Plan } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { MeterTile, StatTile } from "@/components/stat-tile";
import { SpotlightGroup } from "@/components/spotlight";
import { CountUp } from "@/components/count-up";
import { LoadError } from "@/components/load-error";
import { Ring } from "@/components/ring";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { HBar, Legend } from "@/components/hbar";
import { formatBytes, formatNumber, formatDate, pctOf } from "@/lib/format";
import { cn, stagger } from "@/lib/utils";

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}

export default async function UsagePage() {
  const [usage, plans] = await Promise.all([safe(api.usage()), safe(api.plans())]);

  const bytesIn = usage?.usage.bytes_in ?? 0;
  const bytesOut = usage?.usage.bytes_out ?? 0;
  const bwUsed = bytesIn + bytesOut;
  const bwLimit = usage?.limits.bandwidth_bytes_mo ?? 0;
  const bwPct = pctOf(bwUsed, bwLimit);
  const requests = usage?.usage.requests ?? 0;
  const requestLimit = usage?.limits.requests_mo ?? 0;
  const planCode = usage?.plan ?? "free";
  const plan: Plan | undefined = (plans ?? []).find((p) => p.code === planCode);
  const resetsIn = daysUntil(usage?.usage.window_end);
  const near = bwLimit > 0 && bwPct >= 80;

  // Zeros from a failed request would read as "you've used nothing".
  if (usage === null) {
    return (
      <div>
        <PageHeader eyebrow="Account" title="Usage" description="Your monthly usage and limits." />
        <LoadError what="your usage" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Account"
        title="Usage"
        description={
          usage
            ? `Current period · since ${formatDate(usage.usage.window_start)}`
            : "Your monthly usage and limits."
        }
        action={
          planCode === "free" && !near ? (
            <Link href="/billing" className={buttonVariants()}>
              Upgrade <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />

      {near && (
        <div
          role="status"
          className="rise mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-dashed border-foreground/50 bg-accent/60 p-4"
        >
          <TriangleAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-sm">
            <span className="font-medium">
              {bwPct >= 100 ? "You've used all of your bandwidth." : `You've used ${bwPct}% of your bandwidth.`}
            </span>{" "}
            <span className="text-secondary">Upgrade to avoid hitting the limit mid-month.</span>
          </div>
          <Link href="/billing" className={buttonVariants({ size: "sm" })}>
            Upgrade
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card spotlight className="rise p-5 sm:p-6" style={stagger(0)}>
          <span className="eyebrow">Monthly bandwidth</span>
          <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-5">
            <Ring value={bwPct} hatched={near} label="Bandwidth used">
              <span className="text-[1.75rem] font-semibold leading-none tracking-[-0.05em]">
                {bwLimit ? <CountUp value={`${bwPct}%`} /> : "∞"}
              </span>
              <span className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted">used</span>
            </Ring>
            <dl className="flex min-w-0 flex-1 flex-col gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Used</dt>
                <dd className="mt-0.5 text-lg font-semibold tracking-[-0.03em] tabular">{formatBytes(bwUsed)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Allowance</dt>
                <dd className="mt-0.5 font-medium tabular">{bwLimit ? formatBytes(bwLimit) : "Metered"}</dd>
              </div>
              {resetsIn !== null && (
                <div className="flex items-center gap-2 text-xs text-secondary">
                  <CalendarClock className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                  Resets in {resetsIn} {resetsIn === 1 ? "day" : "days"}
                </div>
              )}
            </dl>
          </div>
        </Card>

        <SpotlightGroup className="grid grid-cols-1 content-start gap-4 sm:grid-cols-2">
          {requestLimit > 0 ? (
            <MeterTile
              label="Requests"
              used={formatNumber(requests)}
              limitLabel={formatNumber(requestLimit)}
              pct={pctOf(requests, requestLimit)}
              style={stagger(1)}
            />
          ) : (
            <StatTile label="Requests" value={formatNumber(requests)} sub="Unlimited" style={stagger(1)} />
          )}
          <StatTile
            label="Data in / out"
            value={`${formatBytes(bytesIn)} / ${formatBytes(bytesOut)}`}
            sub="This period"
            style={stagger(2)}
          />
          <Card spotlight className="rise p-5 sm:col-span-2" style={stagger(3)}>
            <div className="flex items-center justify-between gap-3">
              <span className="eyebrow">Traffic split</span>
              <Legend
                items={[
                  { label: "In", colorVar: "rgb(var(--series-1))" },
                  { label: "Out", colorVar: "rgb(var(--series-3))" },
                ]}
              />
            </div>
            <div className="mt-5">
              <HBar
                data={[
                  { label: "In", value: bytesIn, display: formatBytes(bytesIn), colorVar: "rgb(var(--series-1))" },
                  { label: "Out", value: bytesOut, display: formatBytes(bytesOut), colorVar: "rgb(var(--series-3))" },
                ]}
              />
            </div>
          </Card>
        </SpotlightGroup>
      </div>

      <Card className="rise mt-6" style={stagger(4)}>
        <CardHeader>
          <CardTitle>Plan limits</CardTitle>
          <CardDescription>What the {plan?.name ?? planCode} plan includes.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
            <LimitRow label="Bandwidth / mo" value={bwLimit ? formatBytes(bwLimit) : "Metered"} />
            <LimitRow label="Concurrent tunnels" value={plan ? plan.max_concurrent_tunnels || "Metered" : "—"} />
            <LimitRow label="Reserved subdomains" value={plan ? plan.max_reserved_subdomains : "—"} />
            <LimitRow label="Custom domains" value={plan ? (plan.allow_custom_domains ? plan.max_custom_domains : "—") : "—"} />
            <LimitRow label="UDP / TLS" value={plan ? (plan.allow_udp ? "Included" : "—") : "—"} />
            <LimitRow label="Rate limit" value={plan ? (plan.rate_limit_rps ? `${plan.rate_limit_rps} rps` : "Unlimited") : "—"} />
          </dl>
        </CardContent>
      </Card>

      <p className={cn("mt-4 max-w-2xl text-xs leading-relaxed text-muted")}>
        Usage is aggregated from edge metering for the current billing period. Per-day time series will
        appear once the control API exposes a windowed usage endpoint.
      </p>
    </div>
  );
}

function LimitRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-surface p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-semibold tabular">{value}</dd>
    </div>
  );
}

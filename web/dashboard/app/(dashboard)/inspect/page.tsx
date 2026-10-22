import { Activity, ExternalLink } from "lucide-react";
import { api, safe, type Plan } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { StatusDot } from "@/components/status-dot";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRetention } from "@/lib/format";
import { stagger } from "@/lib/utils";

export default async function InspectPage() {
  const [subs, plans] = await Promise.all([safe(api.subscription()), safe(api.plans())]);
  const planCode = subs?.plan ?? "free";
  const plan: Plan | undefined = (plans ?? []).find((p) => p.code === planCode);
  const retention = plan ? formatRetention(plan.inspector_history) : "1 hour";

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Request Inspector"
        description="Inspect and replay requests that flowed through your tunnels."
        action={<Badge variant="outline">Retention: {retention}</Badge>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Request list pane */}
        <Card className="rise scan min-h-[320px] overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="eyebrow">Requests</span>
            <span className="flex items-center gap-2 text-xs text-muted">
              <StatusDot state="pending" /> Waiting
            </span>
          </div>
          <ul aria-hidden="true" className="flex flex-col divide-y divide-border">
            {[0, 1, 2, 3].map((row) => (
              <li key={row} className="flex items-center gap-3 px-4 py-3.5" style={{ opacity: 1 - row * 0.2 }}>
                <Skeleton className="h-5 w-10" />
                <Skeleton className="h-3.5 flex-1" />
                <Skeleton className="h-3.5 w-8" />
              </li>
            ))}
          </ul>
          <p className="px-4 py-5 text-center text-sm text-secondary">Waiting for traffic…</p>
        </Card>

        {/* Detail pane */}
        <Card className="rise flex min-h-[320px] items-center justify-center" style={stagger(1)}>
          <div className="flex max-w-md flex-col items-center px-6 py-10 text-center">
            <div className="relative mb-5 flex h-16 w-16 items-center justify-center">
              <span
                className="orbit absolute inset-0 rounded-full border border-dashed border-border-strong"
                aria-hidden="true"
              />
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent">
                <Activity className="draw-icon h-5 w-5" aria-hidden="true" />
              </span>
            </div>
            <p className="text-base font-semibold tracking-[-0.02em]">The cloud inspector activates with live captures</p>
            <p className="mt-2 text-sm leading-relaxed text-secondary">
              Captured requests stream here once the edge relays them through the control API. Detail
              (headers, timing, body) and one-click replay to your local service will appear per request,
              retained for {retention} on your plan.
            </p>
            <a
              href="https://trqsh.uz/docs/inspector"
              target="_blank"
              rel="noopener noreferrer"
              className="group mt-5 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
            >
              Inspector setup guide
              <ExternalLink
                className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        </Card>
      </div>

      <p className="mt-4 max-w-2xl text-xs leading-relaxed text-muted">
        The cloud inspector consumes a capture stream surfaced by the agent/edge via the control API
        (websocket relay or stored recent captures per plan retention). That relay is a follow-up on the
        edge; the local inspector at <span className="font-mono">127.0.0.1:4040</span> works today.
      </p>
    </div>
  );
}

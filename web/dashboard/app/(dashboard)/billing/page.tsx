import { Check, Send } from "lucide-react";
import { api, safe, type Plan } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { CadenceToggle } from "@/components/cadence-toggle";
import { LoadError } from "@/components/load-error";
import { SpotlightGroup } from "@/components/spotlight";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlanBadge } from "@/components/plan-badge";
import { StatusDot } from "@/components/status-dot";
import { formatBytes, formatPrice } from "@/lib/format";
import { cn, stagger } from "@/lib/utils";

const RANK: Record<string, number> = { free: 0, pro: 1, team: 2, payg: 1 };
const SITE = process.env.TRQSH_SITE_URL || "https://trqsh.uz";

function fmtDate(s?: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ cadence?: string }>;
}) {
  const sp = await searchParams;
  const cadence = sp.cadence === "annual" ? "annual" : "monthly";
  const [me, plansRaw] = await Promise.all([safe(api.me()), safe(api.plans())]);

  // Defaulting to "free" here would tell a paying customer they have no plan.
  if (me === null || plansRaw === null) {
    return (
      <div>
        <PageHeader eyebrow="Account" title="Billing" description="Your plan and how to change it." />
        <LoadError what="your plan" />
      </div>
    );
  }

  const currentPlan = me.plan;
  const expiresAt = me.plan_expires_at ?? null;
  const expDate = fmtDate(expiresAt);
  const expired = !!expiresAt && new Date(expiresAt).getTime() < Date.now();
  const plans = plansRaw
    .filter((p) => p.code !== "payg")
    .sort((a, b) => (RANK[a.code] ?? 9) - (RANK[b.code] ?? 9));

  return (
    <div>
      <PageHeader eyebrow="Account" title="Billing" description="Your plan and how to change it." />

      <Card className="rise mb-8">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-secondary">Current plan</span>
            <PlanBadge plan={currentPlan} />
            {expDate &&
              (expired ? (
                <Badge variant="warning">
                  <StatusDot state="pending" /> Expired {expDate}
                </Badge>
              ) : (
                <Badge variant="good">
                  <StatusDot pulse={false} /> Active until {expDate}
                </Badge>
              ))}
          </div>
          <a
            href={`${SITE}/upgrade?plan=${currentPlan === "team" ? "team" : "pro"}&cadence=${cadence}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            Contact us to change
          </a>
        </CardContent>
      </Card>

      <div className="rise mb-5 flex flex-wrap items-center justify-between gap-3" style={stagger(1)}>
        <h2 className="text-base font-semibold tracking-[-0.02em]">Plans</h2>
        <CadenceToggle value={cadence} />
      </div>

      <SpotlightGroup className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {plans.map((p, i) => (
          <PlanCard
            key={`${p.code}-${cadence}`}
            plan={p}
            cadence={cadence}
            current={p.code === currentPlan}
            index={i}
          />
        ))}
      </SpotlightGroup>

      <p className="mt-5 max-w-2xl text-xs leading-relaxed text-muted">
        We don&apos;t take card payments yet. To upgrade, message us on Telegram with your account email
        and the plan you want — we activate it manually, usually within a few hours.
      </p>
    </div>
  );
}

function PlanCard({
  plan,
  cadence,
  current,
  index,
}: {
  plan: Plan;
  cadence: string;
  current: boolean;
  index: number;
}) {
  // Annual shows the effective per-month price (yearly total ÷ 12), matching the
  // marketing site.
  const monthlyCents =
    cadence === "annual" ? Math.round(plan.price_annual_cents / 12) : plan.price_monthly_cents;
  const features = [
    `${plan.max_bandwidth_bytes_mo ? formatBytes(plan.max_bandwidth_bytes_mo) : "Metered"} bandwidth`,
    `${plan.max_concurrent_tunnels || "Metered"} concurrent ${plan.max_concurrent_tunnels === 1 ? "tunnel" : "tunnels"}`,
    `${plan.max_reserved_subdomains} reserved ${plan.max_reserved_subdomains === 1 ? "subdomain" : "subdomains"}`,
    plan.allow_custom_domains
      ? `${plan.max_custom_domains} custom ${plan.max_custom_domains === 1 ? "domain" : "domains"}`
      : "HTTP/S + TCP",
    plan.allow_udp ? "UDP + TLS tunnels" : null,
  ].filter(Boolean) as string[];
  const paid = plan.code !== "free";

  return (
    <Card
      spotlight
      className={cn("rise flex flex-col", current && "border-foreground ring-1 ring-foreground")}
      style={stagger(index + 2)}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{plan.name}</CardTitle>
          {current && <Badge variant="good">Current</Badge>}
        </div>
        <div className="mt-3">
          <span className="text-4xl font-semibold tracking-[-0.055em] text-foreground">{formatPrice(monthlyCents)}</span>
          {monthlyCents > 0 && <span className="text-sm text-muted"> /mo</span>}
          {cadence === "annual" && plan.price_annual_cents > 0 && (
            <span className="mt-1 block text-xs text-muted">billed {formatPrice(plan.price_annual_cents)}/yr</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <ul className="flex flex-1 flex-col gap-2.5 border-t border-border pt-5 text-sm">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-2.5">
              <Check className="draw-icon h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="text-secondary">{f}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6">
          {current ? (
            <Button variant="outline" className="w-full" disabled>
              Current plan
            </Button>
          ) : paid ? (
            <a
              href={`${SITE}/upgrade?plan=${plan.code}&cadence=${cadence}`}
              className={cn(buttonVariants({ variant: "default" }), "w-full")}
            >
              Get {plan.name}
            </a>
          ) : (
            <Button variant="outline" className="w-full" disabled>
              Free plan
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import * as React from "react";
import { ArrowRight, Check, Minus } from "lucide-react";
import {
  cardPlans,
  paygPlan,
  buildMatrix,
  plans,
  type CatalogPlan,
} from "@/lib/plans";
import { formatBytes, formatPrice, formatRetention } from "@/lib/format";
import { signupUrl, site } from "@/lib/site";
import { buttonVariants } from "./ui/button";
import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";
import "./pricing-table.css";

type Cadence = "monthly" | "annual";

export function PricingTable() {
  const [cadence, setCadence] = React.useState<Cadence>("monthly");
  return (
    <div>
      <div className="pricing-billing">
        <div
          className="flex gap-6"
          role="group"
          aria-label="Billing period"
        >
          {(["monthly", "annual"] as const).map((period) => (
            <button
              key={period}
              type="button"
              aria-pressed={cadence === period}
              onClick={() => setCadence(period)}
              className={cn(
                "min-h-11 border-b-2 py-3 text-sm font-medium transition-colors",
                cadence === period
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {period === "monthly" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">
          Yearly plans include a lower monthly rate.
        </p>
      </div>

      <div className="pricing-plans">
        {cardPlans.map((plan, index) => (
          <PlanColumn
            key={plan.code}
            plan={plan}
            cadence={cadence}
            delay={index * 100}
          />
        ))}
      </div>

      {paygPlan && (
        <div className="mt-6 flex flex-col justify-between gap-5 border-y border-border py-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold">{paygPlan.name}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-secondary">
              For variable workloads and automated workflows. Get metered
              tunnels, bandwidth, and domains.
            </p>
          </div>
          <a
            href={site.telegramUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline" }), "shrink-0")}
          >
            Let’s talk <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      )}

      <FeatureMatrix cadence={cadence} />
    </div>
  );
}

function PlanColumn({
  plan,
  cadence,
  delay,
}: {
  plan: CatalogPlan;
  cadence: Cadence;
  delay: number;
}) {
  const popular = plan.code === "pro";
  const isFree = plan.code === "free";
  const cents =
    cadence === "annual"
      ? Math.round(plan.price_annual_cents / 12)
      : plan.price_monthly_cents;
  const href = isFree
    ? `${signupUrl}?plan=${plan.code}`
    : `/upgrade?plan=${plan.code}&cadence=${cadence}`;
  const taglines: Record<string, string> = {
    free: "For your first tunnel and your next side project.",
    pro: "More room for the things you build every day.",
    team: "For shared workflows and growing teams.",
  };
  const features = [
    `${plan.max_concurrent_tunnels} concurrent tunnels`,
    `${formatBytes(plan.max_bandwidth_bytes_mo)} bandwidth / month`,
    `${plan.max_reserved_subdomains} reserved subdomain${plan.max_reserved_subdomains === 1 ? "" : "s"}`,
    plan.allow_custom_domains
      ? `${plan.max_custom_domains} custom domains`
      : "HTTP, HTTPS, and TCP",
    ...(plan.allow_udp ? ["UDP and TLS tunnels"] : []),
    `${formatRetention(plan.inspector_history)} inspector history`,
  ];

  return (
    <Reveal
      as="article"
      delay={delay}
      className={cn(
        "pricing-plan",
        popular && "is-popular",
      )}
    >
      <div className="flex min-h-6 items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{plan.name}</h2>
        {popular && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted">
            Most popular
          </span>
        )}
      </div>
      <p className="mt-3 min-h-[3rem] text-sm leading-relaxed text-secondary">
        {taglines[plan.code]}
      </p>
      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="tabular text-5xl font-semibold tracking-[-0.055em]">
          {formatPrice(cents)}
        </span>
        <span className="text-sm text-muted">
          {isFree ? "/ forever" : "/ month"}
        </span>
      </div>
      <p className="mt-2 min-h-5 text-xs text-muted">
        {isFree
          ? "No credit card needed"
          : cadence === "annual"
            ? `Billed ${formatPrice(plan.price_annual_cents)} yearly`
            : "Billed monthly"}
      </p>
      <a
        href={href}
        className={cn(
          buttonVariants({ variant: popular ? "default" : "outline" }),
          "mt-6 w-full",
        )}
      >
        {isFree ? "Start free" : `Get ${plan.name}`}{" "}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </a>
      <p className="mt-6 text-xs font-medium text-foreground">
        What’s included
      </p>
      <ul className="mt-4 space-y-3 text-sm">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5">
            <Check
              className="mt-0.5 h-4 w-4 shrink-0 text-foreground"
              aria-hidden="true"
            />
            <span className="text-secondary">{feature}</span>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

function FeatureMatrix({ cadence }: { cadence: Cadence }) {
  const rows = buildMatrix(plans);
  return (
    <section className="mt-20 sm:mt-24">
      <div className="mb-7 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Every detail, in one place</p>
          <h2 className="section-heading mt-3">Find your fit.</h2>
        </div>
        <p className="text-xs text-muted md:hidden">
          Swipe across to compare all plans.
        </p>
      </div>
      <div
        className="relative overflow-x-auto border-y border-border"
        role="region"
        aria-label="Plan comparison, scroll horizontally on small screens"
        tabIndex={0}
      >
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">
            Features and limits for every trqsh plan
          </caption>
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th
                scope="col"
                className="px-5 py-5 text-left font-medium text-secondary"
              >
                Included features
              </th>
              {plans.map((plan) => (
                <th
                  key={plan.code}
                  scope="col"
                  className="px-5 py-5 text-left font-semibold"
                >
                  <span>{plan.name}</span>
                  <span className="tabular mt-1 block text-xs font-normal text-muted">
                    {plan.code === "free"
                      ? "Free forever"
                      : plan.code === "payg"
                        ? "Metered"
                        : `${formatPrice(cadence === "annual" ? plan.price_annual_cents : plan.price_monthly_cents)}/${cadence === "annual" ? "year" : "month"}`}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className="border-b border-border last:border-0 hover:bg-surface-2/70"
              >
                <th
                  scope="row"
                  className="px-5 py-4 text-left font-normal text-secondary"
                >
                  {row.label}
                </th>
                {row.cells.map((cell, index) => (
                  <td key={index} className="tabular px-5 py-4">
                    {typeof cell === "boolean" ? (
                      <span>
                        {cell ? (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Minus
                            className="h-4 w-4 text-muted"
                            aria-hidden="true"
                          />
                        )}
                        <span className="sr-only">
                          {cell ? "Included" : "Not included"}
                        </span>
                      </span>
                    ) : (
                      cell
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

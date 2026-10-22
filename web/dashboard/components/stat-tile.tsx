import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CountUp } from "@/components/count-up";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

function Value({ value }: { value: React.ReactNode }) {
  return typeof value === "string" || typeof value === "number" ? (
    <CountUp value={value} />
  ) : (
    value
  );
}

/** A KPI tile: mono label, hero figure that counts up, quiet footnote. */
export function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  className,
  style,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Card spotlight className={cn("rise p-5", className)} style={style}>
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-muted" />}
      </div>
      <div className="mt-4 text-[1.75rem] font-semibold leading-none tracking-[-0.045em]">
        <Value value={value} />
      </div>
      {sub && <div className="mt-2.5 text-xs text-secondary">{sub}</div>}
    </Card>
  );
}

/** A KPI tile with a magnitude-toward-limit meter and an at-a-glance status. */
export function MeterTile({
  label,
  used,
  limitLabel,
  pct,
  note,
  className,
  style,
}: {
  label: string;
  used: React.ReactNode;
  limitLabel: string;
  pct: number;
  note?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const tone = pct >= 100 ? "critical" : pct >= 80 ? "warning" : "default";
  return (
    <Card spotlight className={cn("rise p-5", className)} style={style}>
      <span className="eyebrow">{label}</span>
      <div className="mt-4 flex items-baseline justify-between gap-2">
        <span className="text-[1.75rem] font-semibold leading-none tracking-[-0.045em]">
          <Value value={used} />
        </span>
        <span className="text-xs text-secondary tabular">of {limitLabel}</span>
      </div>
      <Progress value={pct} tone={tone} label={`${label} used`} className="mt-4" />
      <div
        className={cn(
          "mt-2.5 flex items-center gap-1.5 text-xs",
          tone === "default" ? "text-secondary" : "font-medium text-foreground",
        )}
      >
        {tone !== "default" && <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        {tone === "critical" ? "Limit reached" : tone === "warning" ? "Near limit" : (note ?? `${pct}% used`)}
        {tone !== "default" && <span className="whitespace-nowrap font-normal text-secondary">· {pct}% used</span>}
      </div>
    </Card>
  );
}

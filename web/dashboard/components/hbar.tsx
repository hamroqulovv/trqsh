// A minimal horizontal categorical bar (dataviz): fixed-order series colors,
// 4px rounded data-ends anchored to a recessive track, values direct-labeled so
// identity never rests on color alone. Bars grow in once, staggered.

import type { CSSProperties } from "react";

export interface HBarDatum {
  label: string;
  value: number;
  display: string;
  colorVar: string; // e.g. "rgb(var(--series-1))"
}

export function HBar({ data }: { data: HBarDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <div className="flex flex-col gap-3.5">
      {data.map((d, i) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="w-10 shrink-0 text-xs text-secondary">{d.label}</span>
          <div className="relative h-6 flex-1 overflow-hidden rounded-[5px] bg-foreground/[0.07]">
            <div
              className="bar-fill h-full rounded-[5px]"
              style={
                {
                  width: `${(d.value / max) * 100}%`,
                  backgroundColor: d.colorVar,
                  "--delay": `${200 + i * 140}ms`,
                } as CSSProperties
              }
            />
          </div>
          <span className="w-20 shrink-0 text-right text-xs font-medium tabular">{d.display}</span>
          <span className="hidden w-9 shrink-0 text-right text-xs tabular text-muted sm:block">
            {total ? Math.round((d.value / total) * 100) : 0}%
          </span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; colorVar: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: it.colorVar }} />
          <span className="text-xs text-secondary">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

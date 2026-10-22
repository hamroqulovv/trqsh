import * as React from "react";
import { cn } from "@/lib/utils";

/** A gauge that draws its arc once. Children sit in the middle. */
export function Ring({
  value,
  size = 148,
  hatched,
  label,
  className,
  children,
}: {
  value: number;
  size?: number;
  /** Dashes the arc for near-limit and over-limit states. */
  hatched?: boolean;
  label: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="img"
      aria-label={`${label}: ${v}%`}
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="20" cy="20" r="16" fill="none" stroke="rgb(var(--foreground) / 0.08)" strokeWidth="3.5" />
        {v > 0 && (
          <circle
            className="ring-fill"
            cx="20"
            cy="20"
            r="16"
            fill="none"
            stroke="rgb(var(--foreground))"
            strokeWidth="3.5"
            strokeLinecap="round"
            pathLength={100}
            style={{ strokeDashoffset: 100 - v }}
          />
        )}
        {hatched && (
          <circle
            cx="20"
            cy="20"
            r="12.6"
            fill="none"
            stroke="rgb(var(--foreground) / 0.35)"
            strokeWidth="0.6"
            strokeDasharray="1.2 1.6"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

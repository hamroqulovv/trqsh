import { cn } from "@/lib/utils";

/**
 * A magnitude-toward-cap meter (dataviz). The track is recessive and the fill
 * grows in once. Near and over the cap the fill is hatched, so the warning
 * survives a monochrome palette.
 */
export function Progress({
  value,
  tone = "default",
  className,
  label,
}: {
  value: number;
  tone?: "default" | "warning" | "critical";
  className?: string;
  label?: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("meter", className)}
    >
      <div
        className="meter-fill"
        data-tone={tone === "default" ? undefined : tone}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

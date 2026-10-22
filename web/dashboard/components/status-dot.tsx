import { cn } from "@/lib/utils";

/** Filled and pulsing is live, dashed is pending, hollow is off. Decorative: say the state in text too. */
export function StatusDot({
  state = "live",
  pulse = true,
  className,
}: {
  state?: "live" | "pending" | "off";
  /** Live dots ping outward; turn it off for dots repeated down a list. */
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("dot", className)}
      data-state={state === "live" ? undefined : state}
      data-live={state === "live" && pulse ? "" : undefined}
      aria-hidden="true"
    />
  );
}

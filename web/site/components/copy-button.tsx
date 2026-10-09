"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  className,
  label,
}: {
  value: string;
  className?: string;
  label?: string;
}) {
  const [status, setStatus] = React.useState<"idle" | "copied" | "error">(
    "idle",
  );
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  React.useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      aria-label={
        status === "copied"
          ? "Copied to clipboard"
          : label
            ? `Copy ${label}`
            : "Copy to clipboard"
      }
      onClick={async () => {
        clearTimeout(timer.current);
        try {
          await navigator.clipboard.writeText(value);
          setStatus("copied");
        } catch {
          setStatus("error");
        }
        timer.current = setTimeout(() => setStatus("idle"), 2500);
      }}
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 text-xs text-secondary transition-colors hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      {status === "copied" ? (
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span aria-live="polite">
        {status === "copied"
          ? "Copied"
          : status === "error"
            ? "Copy failed"
            : (label ?? "Copy")}
      </span>
    </button>
  );
}

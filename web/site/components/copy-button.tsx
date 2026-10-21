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
  // The label only rolls in after the first change, not on page load.
  const [changed, setChanged] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  React.useEffect(() => () => clearTimeout(timer.current), []);

  const text =
    status === "copied"
      ? "Copied"
      : status === "error"
        ? "Copy failed"
        : (label ?? "Copy");

  return (
    <button
      type="button"
      data-status={status}
      aria-label={
        status === "copied"
          ? "Copied to clipboard"
          : label
            ? `Copy ${label}`
            : "Copy to clipboard"
      }
      onClick={async () => {
        clearTimeout(timer.current);
        setChanged(true);
        try {
          await navigator.clipboard.writeText(value);
          setStatus("copied");
        } catch {
          setStatus("error");
        }
        timer.current = setTimeout(() => setStatus("idle"), 2500);
      }}
      className={cn(
        "copy-button inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-md border border-border-strong bg-surface px-2.5 text-xs text-secondary hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <span className="copy-icon" aria-hidden="true">
        <Copy className="copy-icon-idle h-3.5 w-3.5" />
        <Check className="copy-icon-done h-3.5 w-3.5" />
      </span>
      <span
        key={text}
        className="copy-label"
        data-initial={changed ? undefined : ""}
        aria-live="polite"
      >
        {text}
      </span>
    </button>
  );
}

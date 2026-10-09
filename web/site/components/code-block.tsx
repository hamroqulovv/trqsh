"use client";

import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

export function CodeBlock({
  code,
  label,
  className,
  prompt = false,
}: {
  code: string;
  label?: string;
  className?: string;
  prompt?: boolean;
}) {
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-lg border border-border bg-surface-2 text-left",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <span className="text-xs font-medium text-muted">
          {label ?? "Terminal"}
        </span>
        <CopyButton value={code} />
      </div>
      <pre
        className="overflow-x-auto px-4 py-4 font-mono text-xs leading-7 sm:text-[0.8rem]"
        tabIndex={0}
        aria-label={label ?? "Terminal command"}
      >
        <code>
          {lines.map((line, index) => (
            <span key={index} className="block">
              {prompt && line && (
                <span className="select-none text-muted" aria-hidden="true">
                  ${" "}
                </span>
              )}
              {line || "\u00a0"}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

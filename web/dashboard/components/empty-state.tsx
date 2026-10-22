import * as React from "react";
import { CommandLine } from "@/components/command-line";
import { cn } from "@/lib/utils";

/** A blank slate that says what goes here and what to do next. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  command,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** A shell command shown with a copy button. */
  command?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center",
        className,
      )}
    >
      <div className="relative mb-5 flex h-16 w-16 items-center justify-center">
        <span
          className="orbit absolute inset-0 rounded-full border border-dashed border-border-strong"
          aria-hidden="true"
        />
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent">
          <Icon className="draw-icon h-5 w-5 text-foreground" />
        </span>
      </div>
      <p className="text-base font-semibold tracking-[-0.02em]">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-secondary">{description}</p>
      )}
      {command && <CommandLine text={command} className="mt-5 w-full max-w-xs text-left" />}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

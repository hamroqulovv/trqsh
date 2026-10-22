import * as React from "react";
import { stagger } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Small mono label above the title, e.g. the nav group. */
  eyebrow?: string;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="eyebrow rise-sm flex items-center gap-2.5">
            <span className="h-px w-6 bg-foreground/50" aria-hidden="true" />
            {eyebrow}
          </p>
        )}
        <h1 className="mt-3 text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.045em] sm:text-[2rem]">
          <span className="title-mask">
            <span className="title-line">{title}</span>
          </span>
        </h1>
        {description && (
          <p className="rise-sm mt-2.5 max-w-xl text-sm leading-relaxed text-secondary" style={stagger(2)}>
            {description}
          </p>
        )}
      </div>
      {action && (
        <div className="rise-sm flex flex-wrap items-center gap-2" style={stagger(3)}>
          {action}
        </div>
      )}
    </div>
  );
}

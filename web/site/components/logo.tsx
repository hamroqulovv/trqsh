import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center gap-2.5 whitespace-nowrap",
        className,
      )}
      aria-label="trqsh"
    >
      <svg
        width="30"
        height="30"
        viewBox="0 0 32 32"
        fill="none"
        className="shrink-0"
        aria-hidden="true"
      >
        <rect width="32" height="32" rx="8" fill="currentColor" />
        <g
          stroke="rgb(var(--page))"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path className="logo-chevron" d="m8 10 6 6-6 6" />
          <path className="logo-cursor" d="M18 22h6" />
        </g>
      </svg>
      <span
        className="text-[1.5rem] font-bold leading-none tracking-[-0.065em]"
        aria-hidden="true"
      >
        {Array.from("trqsh", (letter, index) => (
          <span
            key={index}
            className="logo-letter"
            style={{ "--i": index } as CSSProperties}
          >
            {letter}
          </span>
        ))}
      </span>
    </span>
  );
}

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import logo from "@/public/trqsh-logo.png";

export function Logo({
  className,
  wordmark = true,
}: {
  className?: string;
  wordmark?: boolean;
}) {
  return (
    <span
      className={cn(
        "brand inline-flex shrink-0 select-none items-center gap-2.5 whitespace-nowrap",
        className,
      )}
      aria-label="trqsh"
    >
      <svg
        width="30"
        height="30"
        viewBox="0 0 32 32"
        fill="none"
        className="shrink-0 overflow-hidden rounded-lg"
        aria-hidden="true"
      >
        <image href={logo.src} width="32" height="32" />
      </svg>
      {wordmark && (
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
      )}
    </span>
  );
}

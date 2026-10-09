import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex select-none items-center gap-2.5", className)}
      aria-label="trqsh"
    >
      <svg
        width="30"
        height="30"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
      >
        <rect width="32" height="32" rx="8" fill="currentColor" />
        <path
          d="m8 10 6 6-6 6m10 0h6"
          stroke="rgb(var(--page))"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-[1.5rem] font-bold leading-none tracking-[-0.065em]">
        trqsh
      </span>
    </span>
  );
}

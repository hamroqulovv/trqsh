import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md border border-border-strong bg-surface px-3 py-1 text-base text-foreground transition-[border-color,box-shadow] duration-200 sm:h-9 sm:text-sm",
        "placeholder:text-muted hover:border-foreground/40 focus-visible:border-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/15",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

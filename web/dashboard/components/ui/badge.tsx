import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// The palette is monochrome, so status reads through shape as well as ink:
// solid is strongest, dashed is pending, tinted is calm.
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-transparent bg-accent text-foreground",
        outline: "border-border-strong text-secondary",
        good: "border-transparent bg-foreground/10 text-foreground",
        warning: "border-dashed border-foreground/45 text-foreground",
        critical: "border-transparent bg-foreground text-page",
        muted: "border-transparent bg-accent text-muted",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

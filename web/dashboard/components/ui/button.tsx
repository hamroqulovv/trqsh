import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// The same variants work for buttons and navigation links.
const buttonVariants = cva(
  "ui-button inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-page disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border border-primary bg-primary text-primary-foreground hover:bg-primary/85",
        outline:
          "border border-border-strong bg-surface text-foreground hover:border-foreground/40 hover:bg-accent",
        ghost: "hover:bg-accent hover:text-foreground",
        subtle: "bg-accent text-foreground hover:bg-border",
        destructive: "border border-critical bg-critical text-page hover:opacity-90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 sm:h-9",
        sm: "h-9 px-3 text-xs sm:h-8",
        lg: "h-11 px-6 sm:h-10",
        icon: "h-10 w-10 sm:h-9 sm:w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Shows a spinner and blocks clicks while work is in flight. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

export { buttonVariants };

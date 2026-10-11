import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
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
        destructive: "bg-critical text-white hover:opacity-90",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-3.5 text-xs",
        lg: "h-12 px-6",
        xl: "h-[52px] px-7 text-sm",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { buttonVariants };

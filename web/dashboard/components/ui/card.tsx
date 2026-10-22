import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A surface. With `spotlight`, wrap a group of cards in <SpotlightGroup> and the
 * border nearest the pointer lights up.
 */
export function Card({
  className,
  spotlight,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { spotlight?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface",
        spotlight && "spotlight card-hover",
        className,
      )}
      {...props}
    >
      {spotlight && <span className="spotlight-fill" aria-hidden="true" />}
      {children}
    </div>
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 p-5 sm:p-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-base font-semibold leading-none tracking-[-0.02em]", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm leading-relaxed text-secondary", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0 sm:p-6 sm:pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-2 p-5 pt-0 sm:p-6 sm:pt-0", className)} {...props} />;
}

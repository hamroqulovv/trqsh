"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shown where data should be when the API call failed. An empty list and a
 * failed request look the same in the data, so pages must say which it was:
 * telling someone they have "no API keys" when the API was only unreachable is
 * wrong, and Billing would otherwise show a paying customer the Free plan.
 */
export function LoadError({
  what,
  className,
}: {
  /** What could not be loaded, as a noun phrase: "your API keys". */
  what: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <div
      role="alert"
      className={cn(
        "rise flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-dashed border-foreground/50 bg-accent/60 p-4 sm:p-5",
        className,
      )}
    >
      <TriangleAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">We couldn&apos;t load {what}.</p>
        <p className="mt-0.5 text-secondary">
          This is a connection problem, not missing data. Nothing was changed.
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        loading={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        Try again
      </Button>
    </div>
  );
}

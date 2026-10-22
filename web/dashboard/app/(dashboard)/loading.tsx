import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Shown the instant a route is chosen, while its server data loads.
export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true">
        <div className="mb-8">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-8 w-56" />
          <Skeleton className="mt-3 h-4 w-72 max-w-full" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-5 h-7 w-28" />
              <Skeleton className="mt-4 h-2 w-full rounded-full" />
            </Card>
          ))}
        </div>
        <Card className="mt-6 p-6">
          <Skeleton className="h-4 w-40" />
          <div className="mt-6 flex flex-col gap-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

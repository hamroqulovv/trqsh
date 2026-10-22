"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

// A page failed to render; the sidebar and top bar stay put so there is a way out.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // reset() alone re-renders with the cached server error; the route has to be
  // refreshed too for the server to run again.
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });
  return (
    <EmptyState
      className="rise"
      icon={TriangleAlert}
      title="Something went wrong"
      description={
        <>
          This page could not load. Try again, and if it keeps happening let us know
          {error.digest ? (
            <>
              {" "}
              with reference <span className="font-mono text-xs">{error.digest}</span>
            </>
          ) : null}
          .
        </>
      }
      action={
        <Button onClick={retry} loading={pending}>
          {!pending && <RotateCcw className="h-4 w-4" aria-hidden="true" />} Try again
        </Button>
      }
    />
  );
}

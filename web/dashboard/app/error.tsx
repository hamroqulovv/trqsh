"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, WifiOff } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

// The shell itself could not load (for example the API is unreachable), so
// there is no sidebar to fall back on. Signing the person out would be wrong;
// the account is fine, so offer a retry instead.
export default function RootError({
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
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <span className="rise-sm mb-10">
        <Logo />
      </span>
      <span className="rise-sm flex h-12 w-12 items-center justify-center rounded-full bg-accent" style={{ "--i": 1 } as React.CSSProperties}>
        <WifiOff className="draw-icon h-5 w-5" aria-hidden="true" />
      </span>
      <h1 className="rise-sm mt-5 text-2xl font-semibold tracking-[-0.04em]" style={{ "--i": 2 } as React.CSSProperties}>
        We couldn&apos;t load your workspace
      </h1>
      <p className="rise-sm mt-2 max-w-sm text-sm leading-relaxed text-secondary" style={{ "--i": 3 } as React.CSSProperties}>
        The trqsh API didn&apos;t answer. This is usually brief, and your session is safe. Try again in a
        moment.
        {error.digest && (
          <>
            {" "}
            <span className="font-mono text-xs text-muted">Reference {error.digest}</span>
          </>
        )}
      </p>
      <Button className="rise-sm mt-7" onClick={retry} loading={pending} style={{ "--i": 4 } as React.CSSProperties}>
        {!pending && <RotateCcw className="h-4 w-4" aria-hidden="true" />} Try again
      </Button>
    </main>
  );
}

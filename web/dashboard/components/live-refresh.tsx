"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { StatusDot } from "@/components/status-dot";
import { cn } from "@/lib/utils";

function ago(seconds: number) {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

/**
 * Re-renders the page's server data on a timer while the tab is visible. The
 * chip pauses and resumes it; the button refreshes right now.
 */
export function LiveRefresh({ interval = 10_000 }: { interval?: number }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [live, setLive] = React.useState(true);
  const [updatedAt, setUpdatedAt] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(0);

  const refresh = React.useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  // Stamp the time once the data has landed, not when it was requested.
  React.useEffect(() => {
    if (!pending) setUpdatedAt(Date.now());
  }, [pending]);

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, interval);
    // Catch up straight away when the tab comes back after a long absence.
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - (updatedAt ?? 0) > interval) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [live, interval, refresh, updatedAt]);

  const seconds = updatedAt && now ? Math.max(0, Math.round((now - updatedAt) / 1000)) : 0;

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-pressed={live}
        onClick={() => setLive((value) => !value)}
        title={live ? "Pause live updates" : "Resume live updates"}
        className="inline-flex h-10 items-center gap-2.5 rounded-md border border-border bg-surface px-3 text-xs text-secondary transition-[border-color,background-color,color,transform] duration-200 hover:border-border-strong hover:bg-accent hover:text-foreground active:scale-[0.97] sm:h-9"
      >
        <StatusDot state={live ? "live" : "off"} />
        <span className="font-medium text-foreground">{live ? "Live" : "Paused"}</span>
        <span className="tabular text-muted" aria-live="off">
          {updatedAt && now ? ago(seconds) : "…"}
        </span>
      </button>
      <button
        type="button"
        onClick={refresh}
        aria-label="Refresh now"
        title="Refresh now"
        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface text-secondary transition-[border-color,background-color,color,transform] duration-200 hover:border-border-strong hover:bg-accent hover:text-foreground active:scale-90 sm:h-9 sm:w-9"
      >
        <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} aria-hidden="true" />
      </button>
    </div>
  );
}

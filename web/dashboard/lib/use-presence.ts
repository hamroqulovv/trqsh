"use client";

import * as React from "react";

/**
 * Keeps something mounted for `exitMs` after `open` turns false, so it can play
 * an exit animation. `closing` is true during that window.
 */
export function usePresence(open: boolean, exitMs = 140) {
  const [mounted, setMounted] = React.useState(open);

  React.useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMounted(false);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [open, exitMs]);

  return { mounted: open || mounted, closing: !open && mounted };
}

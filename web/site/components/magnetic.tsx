"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Pulls its child toward the pointer while the pointer is over it (plus a
// small capture margin), then springs back on leave. The icon inside a
// `.ui-button` follows a little further, so the control reads as layered.
// Inert on touch and when the visitor prefers reduced motion.
export function Magnetic({
  children,
  className,
  strength = 0.3,
}: {
  children: React.ReactNode;
  className?: string;
  /** Share of the pointer's distance from center the child travels. */
  strength?: number;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fine = window.matchMedia("(pointer: fine)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let x = 0;
    let y = 0;

    const apply = () => {
      frame = 0;
      el.style.setProperty("--mag-x", `${x.toFixed(2)}px`);
      el.style.setProperty("--mag-y", `${y.toFixed(2)}px`);
    };
    const onMove = (event: PointerEvent) => {
      if (!fine.matches || still.matches) return;
      const rect = el.getBoundingClientRect();
      x = (event.clientX - (rect.left + rect.width / 2)) * strength;
      y = (event.clientY - (rect.top + rect.height / 2)) * strength;
      el.classList.add("is-magnetic");
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      el.classList.remove("is-magnetic");
      el.style.setProperty("--mag-x", "0px");
      el.style.setProperty("--mag-y", "0px");
    };

    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [strength]);

  return (
    <span ref={ref} className={cn("magnetic", className)}>
      {children}
    </span>
  );
}

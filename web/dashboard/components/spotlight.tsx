"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// One pointer listener for a group of `.spotlight` surfaces. Each gets the
// pointer position in its own coordinates (--mx/--my), so a glow near a shared
// edge lights the neighbouring card's border too. The group carries
// [data-spot] while the pointer is inside it.
export function SpotlightGroup({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const fine = window.matchMedia("(pointer: fine)");
    let frame = 0;
    let x = 0;
    let y = 0;

    const update = () => {
      frame = 0;
      for (const el of root.querySelectorAll<HTMLElement>(".spotlight")) {
        const rect = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${(x - rect.left).toFixed(1)}px`);
        el.style.setProperty("--my", `${(y - rect.top).toFixed(1)}px`);
      }
    };
    const onMove = (event: PointerEvent) => {
      if (!fine.matches) return;
      x = event.clientX;
      y = event.clientY;
      root.dataset.spot = "";
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onLeave = () => {
      delete root.dataset.spot;
    };

    root.addEventListener("pointermove", onMove, { passive: true });
    root.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={ref} className={cn(className)} style={style}>
      {children}
    </div>
  );
}

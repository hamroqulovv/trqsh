"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// One pointer listener for a group of `.spotlight` surfaces (or bare
// `[data-spotlight]` elements that only want the coordinates). Each gets
// the pointer position in its own coordinates (--mx/--my in px, --px/--py as
// 0–1), so a glow near a shared edge lights the neighbouring card's border
// too. The group carries [data-spot] while the pointer is inside it.
export function SpotlightGroup({
  children,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}) {
  const ref = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const fine = window.matchMedia("(pointer: fine)");
    let frame = 0;
    let x = 0;
    let y = 0;

    const update = () => {
      frame = 0;
      const surfaces = Array.from(
        root.querySelectorAll<HTMLElement>(".spotlight, [data-spotlight]"),
      );
      if (root.classList.contains("spotlight")) surfaces.push(root);
      for (const el of surfaces) {
        const rect = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${(x - rect.left).toFixed(1)}px`);
        el.style.setProperty("--my", `${(y - rect.top).toFixed(1)}px`);
        el.style.setProperty("--px", ((x - rect.left) / rect.width).toFixed(3));
        el.style.setProperty("--py", ((y - rect.top) / rect.height).toFixed(3));
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
    <Tag ref={ref} className={cn("spotlight-group", className)}>
      {children}
    </Tag>
  );
}

"use client";

import * as React from "react";

// Publishes --hero-p on the enclosing section: 0 at the top of the page,
// 1 once the hero has scrolled away. CSS turns it into the copy lifting and
// fading and the tunnel pushing forward. One style write per changed frame.
export function HeroMotion() {
  const ref = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    const section = ref.current?.closest("section");
    if (!section) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let last = "";

    const update = () => {
      frame = 0;
      if (still.matches) {
        section.style.removeProperty("--hero-p");
        last = "";
        return;
      }
      const height = section.offsetHeight || 1;
      const progress = Math.min(Math.max(window.scrollY / height, 0), 1).toFixed(4);
      // Once the hero is fully scrolled away there is nothing left to move.
      if (progress !== last) section.style.setProperty("--hero-p", progress);
      last = progress;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    still.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      still.removeEventListener("change", schedule);
    };
  }, []);

  return <span ref={ref} hidden />;
}

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Content is visible on the server and without JavaScript. Only offscreen
// content is put into a pending state, then revealed once as it enters view.
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: React.ElementType;
}) {
  const ref = React.useRef<HTMLElement | null>(null);
  const [phase, setPhase] = React.useState<"initial" | "pending" | "shown">("initial");

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches || !("IntersectionObserver" in window)) {
      setPhase("shown");
      return;
    }

    if (el.getBoundingClientRect().top < window.innerHeight - 48) {
      setPhase("shown");
      return;
    }

    setPhase("pending");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setPhase("shown");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -48px 0px", threshold: 0.08 }
    );
    const onMotionChange = () => {
      if (motion.matches) {
        setPhase("shown");
        io.disconnect();
      }
    };

    io.observe(el);
    motion.addEventListener("change", onMotionChange);
    return () => {
      io.disconnect();
      motion.removeEventListener("change", onMotionChange);
    };
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<HTMLElement>}
      className={cn("reveal", phase === "pending" && "reveal-pending", phase === "shown" && "reveal-in", className)}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
      onFocusCapture={() => setPhase("shown")}
    >
      {children}
    </Tag>
  );
}

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// "4.5 GB" -> ["", 4.5, " GB"]; "21,581" keeps its separators. Anything with a
// second number in it ("1 GB / 3 GB") is left to render as plain text.
const NUMBER = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(\D*)$/;

function parse(text: string) {
  const match = NUMBER.exec(text);
  if (!match) return null;
  const [, prefix, digits, suffix] = match;
  const decimals = digits.includes(".") ? digits.split(".")[1].length : 0;
  return {
    prefix,
    suffix,
    decimals,
    grouped: digits.includes(","),
    target: Number(digits.replace(/,/g, "")),
  };
}

/**
 * A figure that counts up from zero the first time it is on screen. The final
 * text is always what assistive tech reads, and it renders as-is when the
 * value is not a single number, sits offscreen, or motion is reduced.
 */
export function CountUp({
  value,
  duration = 1200,
  className,
}: {
  value: string | number;
  duration?: number;
  className?: string;
}) {
  const text = typeof value === "number" ? String(value) : value;
  const ref = React.useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = React.useState(text);
  // Hidden until hydration so the server's final value never flashes before 0.
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    const parts = parse(text);
    setDisplay(text);
    if (
      !el ||
      !parts ||
      parts.target === 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      el.getBoundingClientRect().top > window.innerHeight
    ) {
      setReady(true);
      return;
    }

    const format = (n: number) => {
      const body = parts.grouped
        ? n.toLocaleString("en-US", {
            minimumFractionDigits: parts.decimals,
            maximumFractionDigits: parts.decimals,
          })
        : n.toFixed(parts.decimals);
      return `${parts.prefix}${body}${parts.suffix}`;
    };

    let frame = 0;
    const start = performance.now();
    setDisplay(format(0));
    setReady(true);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      setDisplay(t < 1 ? format(parts.target * eased) : text);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, duration]);

  return (
    <span
      ref={ref}
      className={cn("tabular", !ready && "count-pending", className)}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{display}</span>
    </span>
  );
}

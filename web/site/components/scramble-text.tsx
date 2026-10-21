"use client";

import * as React from "react";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>_";

// Decodes text like a terminal resolving output: glyphs cycle at random and
// lock in from left to right. Spaces and punctuation stay put so the line
// keeps its shape. Plays once when the text enters view; the server render
// and reduced-motion visitors get the final text.
export function ScrambleText({
  text,
  className,
  duration = 900,
  delay = 150,
  glyphs = GLYPHS,
}: {
  text: string;
  className?: string;
  duration?: number;
  delay?: number;
  glyphs?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [output, setOutput] = React.useState<{ char: string; done: boolean }[] | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    const chars = Array.from(text);
    let frame = 0;
    let timer = 0;
    let start = 0;

    const tick = (now: number) => {
      if (!start) start = now;
      const progress = Math.min((now - start) / duration, 1);
      // Each glyph locks at a slightly randomised point along the sweep.
      const locked = progress * (chars.length + 4);
      setOutput(
        chars.map((char, index) => {
          if (!/[A-Za-z0-9]/.test(char) || index < locked - 4) {
            return { char, done: true };
          }
          return {
            char: glyphs[Math.floor(Math.random() * glyphs.length)],
            done: false,
          };
        }),
      );
      if (progress < 1) frame = requestAnimationFrame(tick);
      else setOutput(null);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();
        timer = window.setTimeout(() => {
          frame = requestAnimationFrame(tick);
        }, delay);
      },
      { rootMargin: "0px 0px -48px 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [text, duration, delay, glyphs]);

  return (
    <span ref={ref} className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {output
          ? output.map((item, index) =>
              item.done ? (
                item.char
              ) : (
                <span key={index} className="scramble-glyph">
                  {item.char}
                </span>
              ),
            )
          : text}
      </span>
    </span>
  );
}

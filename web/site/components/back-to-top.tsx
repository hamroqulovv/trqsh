"use client";

import { ArrowUp } from "lucide-react";

export function BackToTop() {
  return (
    <button
      type="button"
      onClick={() => {
        const still = window.matchMedia("(prefers-reduced-motion: reduce)");
        window.scrollTo({ top: 0, behavior: still.matches ? "auto" : "smooth" });
        document.getElementById("main-content")?.focus({ preventScroll: true });
      }}
      className="back-to-top"
    >
      Back to top
      <span className="back-to-top-icon" aria-hidden="true">
        <ArrowUp className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

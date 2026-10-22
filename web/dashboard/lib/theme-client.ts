"use client";

import * as React from "react";
import {
  DARK_THEME_COLOR,
  LIGHT_THEME_COLOR,
  THEME_COLOR_META_ID,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

export type ThemePref = "light" | "dark" | "system";

const CHANGE_EVENT = "trqsh-theme-change";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> };
};

function storedPref(): ThemePref {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function systemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(dark: boolean) {
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.dataset.theme = dark ? "dark" : "light";
  document
    .getElementById(THEME_COLOR_META_ID)
    ?.setAttribute("content", dark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
}

/**
 * Persist and apply a theme. With an origin, the new theme spreads out from that
 * point as a growing circle; without one (or without view transitions, or with
 * reduced motion) it switches in place.
 */
export function setThemePref(
  pref: ThemePref,
  origin?: { x: number; y: number },
) {
  const dark = pref === "system" ? systemDark() : pref === "dark";
  const commit = () => {
    try {
      if (pref === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, pref);
    } catch {}
    applyTheme(dark);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  const doc = document as ViewTransitionDocument;
  if (
    !origin ||
    !doc.startViewTransition ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    commit();
    return;
  }
  const { x, y } = origin;
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );
  doc
    .startViewTransition(commit)
    .ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 700,
          easing: "cubic-bezier(0.65, 0, 0.35, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    })
    .catch(() => {});
}

export function toggleTheme(origin?: { x: number; y: number }) {
  const dark = document.documentElement.classList.contains("dark");
  setThemePref(dark ? "light" : "dark", origin);
}

/** Centre of an element, for anchoring the theme transition on a button. */
export function centerOf(el: Element) {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function subscribe(onChange: () => void) {
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    // Follow the OS only while the visitor has not picked a theme.
    if (storedPref() === "system") applyTheme(system.matches);
    onChange();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      applyTheme(
        storedPref() === "system" ? system.matches : storedPref() === "dark",
      );
      onChange();
    }
  };
  system.addEventListener("change", onSystem);
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    system.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

// Snapshots are strings so React can compare them by value.
const snapshot = () =>
  `${storedPref()}:${document.documentElement.classList.contains("dark") ? "dark" : "light"}`;

/** The saved preference and whether the page is currently dark. */
export function useTheme(): { pref: ThemePref; dark: boolean } {
  const value = React.useSyncExternalStore(subscribe, snapshot, () => "system:light");
  const [pref, mode] = value.split(":");
  return { pref: pref as ThemePref, dark: mode === "dark" };
}

import type { CSSProperties } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** cn merges class names, resolving Tailwind conflicts (last wins). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Entrance delay slot for `.rise` / `.rise-sm`; capped so long lists never lag. */
export function stagger(index: number, cap = 9): CSSProperties {
  return { "--i": Math.min(index, cap) } as CSSProperties;
}

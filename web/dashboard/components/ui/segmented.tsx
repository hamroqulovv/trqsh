"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

/** A radio group drawn as a pill; one thumb springs between the options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  /** The element that was chosen is passed along, to anchor a transition on it. */
  onChange: (value: T, origin: HTMLElement) => void;
  label: string;
  className?: string;
}) {
  const index = Math.max(0, options.findIndex((option) => option.value === value));

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const nextIndex = (index + step + options.length) % options.length;
    const radio = event.currentTarget.querySelectorAll<HTMLElement>("[role=radio]")[nextIndex];
    radio?.focus();
    onChange(options[nextIndex].value, radio);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("seg", className)}
      style={{ "--seg-n": options.length, "--seg-i": index } as React.CSSProperties}
    >
      <span className="seg-thumb" aria-hidden="true" />
      {options.map(({ value: optionValue, label: text, icon: Icon }) => {
        const selected = optionValue === value;
        return (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={(event) => onChange(optionValue, event.currentTarget)}
            className={cn("seg-option", selected && "is-selected")}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {text}
          </button>
        );
      })}
    </div>
  );
}

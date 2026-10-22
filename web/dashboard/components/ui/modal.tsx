"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const EXIT_MS = 190;

/**
 * A native <dialog> opened with showModal(), so focus is trapped, Escape works
 * and the page behind is inert without extra code. It animates out before it
 * closes, and the browser hands focus back to whatever opened it.
 *
 * Mark the element that should take focus first with `data-autofocus`;
 * otherwise the first focusable element does.
 */
export function Modal({
  open,
  onClose,
  label,
  placement = "center",
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  placement?: "center" | "top" | "left";
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  // A drag that starts in the panel (selecting text) and ends on the backdrop
  // must not count as a backdrop click.
  const pressedBackdrop = React.useRef(false);
  const [closing, setClosing] = React.useState(false);
  const [mounted, setMounted] = React.useState(open);

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open) {
      setMounted(true);
      setClosing(false);
      if (!dialog.open) {
        dialog.showModal();
        dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
      }
      return;
    }
    if (!dialog.open) {
      setMounted(false);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dialog.close();
      setMounted(false);
      return;
    }
    setClosing(true);
    const timer = window.setTimeout(() => {
      dialog.close();
      setClosing(false);
      setMounted(false);
    }, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      data-placement={placement}
      data-closing={closing ? "" : undefined}
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedBackdrop.current && event.target === event.currentTarget) onClose();
        pressedBackdrop.current = false;
      }}
    >
      {(open || mounted) && (
        <div className={cn("modal-panel", className)}>{children}</div>
      )}
    </dialog>
  );
}

"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu } from "lucide-react";
import { DocsSidebar } from "./docs-sidebar";

export function DocsMobileNav() {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => setOpen(false), [pathname]);
  React.useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  return (
    <div className="border-b border-border lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        className="flex min-h-14 w-full items-center gap-2 text-sm font-medium"
        aria-expanded={open}
        aria-controls="docs-mobile-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <Menu className="h-4 w-4" aria-hidden="true" /> Browse documentation{" "}
        <ChevronDown
          className={`ml-auto h-4 w-4 text-muted ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id="docs-mobile-menu" className="pb-6">
          <DocsSidebar onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

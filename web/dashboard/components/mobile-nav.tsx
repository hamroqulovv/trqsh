"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { Nav } from "@/components/nav";
import { Modal } from "@/components/ui/modal";

// A drawer for the sidebar below lg. It is a native dialog, so focus is
// trapped and Escape closes it; picking a link closes it too.
export function MobileNav({
  header,
  footer,
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  React.useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label="Open navigation"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface text-secondary transition-[color,background-color,border-color,transform] duration-200 hover:border-border-strong hover:bg-accent hover:text-foreground active:scale-90"
      >
        <Menu className="h-4 w-4" aria-hidden="true" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        label="Navigation"
        placement="left"
        className="flex h-dvh w-[19rem] max-w-[86vw] flex-col border-r border-border-strong bg-surface shadow-[0_0_80px_-20px_rgb(0_0_0/0.6)]"
      >
        <div className="flex h-16 shrink-0 items-center justify-between pl-5 pr-3">
          <Link href="/" aria-label="trqsh overview" onClick={() => setOpen(false)}>
            <Logo />
          </Link>
          <button
            type="button"
            data-autofocus
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-secondary transition-[color,background-color,transform] duration-200 hover:bg-accent hover:text-foreground active:scale-90"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {header}
        {/* A click on any link bubbles up here, so even the current page closes the drawer. */}
        <div className="mt-6 min-h-0 flex-1 overflow-y-auto pb-4" onClick={() => setOpen(false)}>
          <Nav label="Mobile navigation" />
        </div>
        <div className="border-t border-border">{footer}</div>
      </Modal>
    </div>
  );
}

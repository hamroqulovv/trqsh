"use client";

import * as React from "react";
import type { TocItem } from "@/lib/docs-nav";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowUp, ArrowUpRight, List } from "lucide-react";

// On-page table of contents with a scroll-spy highlight. Rendered from the TOC
// the server extracted while rendering Markdown, so it needs no DOM parsing.
export function DocsToc({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = React.useState<string>("");

  React.useEffect(() => {
    if (items.length === 0) return;
    const headings = items.map((item) => document.getElementById(item.id)).filter((element): element is HTMLElement => !!element);
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = headings[0];
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= 150) current = heading;
      }
      setActiveId(current?.id ?? "");
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [items]);

  if (items.length < 2) return null;

  return (
    <div className="docs-toc sticky top-28">
      <div className="docs-toc-title"><List size={14} aria-hidden="true" /> On this page</div>
      <ul className="flex flex-col gap-1 border-l border-border">
        {items.map((item) => (
          <li key={item.id} className={item.level === 3 ? "pl-3" : ""}>
            <a
              href={`#${item.id}`}
              aria-current={activeId === item.id ? "location" : undefined}
              className={cn(
                "-ml-px block border-l-2 py-1.5 pl-4 text-[13px] leading-5 transition-colors",
                activeId === item.id
                  ? "border-primary font-medium text-primary"
                  : "border-transparent text-secondary hover:text-foreground"
              )}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
      <div className="docs-toc-footer">
        <Link href="/docs/troubleshooting">Troubleshooting <ArrowUpRight size={13} aria-hidden="true" /></Link>
        <a href="#docs-top">Back to top <ArrowUp size={13} aria-hidden="true" /></a>
      </div>
    </div>
  );
}

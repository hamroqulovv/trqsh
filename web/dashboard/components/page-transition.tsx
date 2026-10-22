"use client";

import { usePathname } from "next/navigation";

// Replays a soft entrance whenever the route changes. Keying the wrapper on the
// pathname remounts it, so each page's own `.rise` children stagger in again.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}

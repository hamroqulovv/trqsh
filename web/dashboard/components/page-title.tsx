"use client";

import { usePathname } from "next/navigation";
import { currentItem, normalizePath } from "@/components/nav-config";

/** Where you are: organization, then the current page. */
export function PageTitle({ orgName }: { orgName: string }) {
  const pathname = normalizePath(usePathname());
  const item = currentItem(pathname);
  const Icon = item?.icon;
  return (
    <div className="flex min-w-0 items-center gap-2.5 text-sm">
      <span className="hidden max-w-[10rem] truncate text-muted xl:inline">{orgName}</span>
      <span className="hidden text-border-strong xl:inline" aria-hidden="true">
        /
      </span>
      <span key={pathname} className="rise-sm flex min-w-0 items-center gap-2 font-medium">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />}
        <span className="truncate">{item?.label ?? "Dashboard"}</span>
      </span>
    </div>
  );
}

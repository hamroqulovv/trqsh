import {
  Activity,
  BarChart3,
  CreditCard,
  Globe,
  KeyRound,
  LayoutDashboard,
  Network,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { dashboardBasePath } from "@/lib/paths";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Second key of the "g then …" shortcut. */
  key: string;
  description: string;
}

export const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard, key: "o", description: "Your account at a glance" },
      { href: "/tunnels", label: "Tunnels", icon: Network, key: "t", description: "Live tunnels on the edge" },
      { href: "/domains", label: "Domains", icon: Globe, key: "d", description: "Subdomains and custom domains" },
      { href: "/keys", label: "API Keys", icon: KeyRound, key: "k", description: "Create and revoke keys" },
      { href: "/inspect", label: "Inspector", icon: Activity, key: "i", description: "Inspect and replay requests" },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/usage", label: "Usage", icon: BarChart3, key: "u", description: "Bandwidth and request limits" },
      { href: "/billing", label: "Billing", icon: CreditCard, key: "b", description: "Plan and upgrades" },
      { href: "/team", label: "Team", icon: Users, key: "m", description: "Members and roles" },
      { href: "/settings", label: "Settings", icon: Settings, key: "s", description: "Account, organization, appearance" },
    ],
  },
];

export const navItems = navGroups.flatMap((group) => group.items);

/** usePathname() may include the mount path; routes here never do. */
export function normalizePath(current: string): string {
  if (!dashboardBasePath) return current;
  if (current === dashboardBasePath) return "/";
  return current.startsWith(`${dashboardBasePath}/`)
    ? current.slice(dashboardBasePath.length)
    : current;
}

export function isActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function currentItem(pathname: string): NavItem | undefined {
  return navItems.find((item) => isActive(item.href, pathname));
}

export const DOCS_URL = "https://trqsh.uz/docs";

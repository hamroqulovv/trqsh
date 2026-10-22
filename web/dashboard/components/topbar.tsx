import { SearchButton } from "@/components/command-palette";
import { MobileNav } from "@/components/mobile-nav";
import { PageTitle } from "@/components/page-title";
import { ScrollProgress } from "@/components/scroll-progress";
import { OrgChip, SidebarFooter, type SidebarUsage } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import type { Org, User } from "@/lib/api";

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  team: "Team",
  payg: "Pay-as-you-go",
};

export function Topbar({
  org,
  user,
  usage,
}: {
  org: Org;
  user: User;
  usage: SidebarUsage | null;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-page/80 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <MobileNav header={<OrgChip org={org} />} footer={<SidebarFooter org={org} usage={usage} />} />
        <PageTitle orgName={org.name} />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SearchButton />
          <ThemeToggle />
          <UserMenu
            name={user.name}
            email={user.email}
            avatarUrl={user.avatar_url}
            orgName={org.name}
            planLabel={PLAN_LABELS[org.plan] ?? org.plan}
          />
        </div>
      </div>
      <ScrollProgress />
    </header>
  );
}

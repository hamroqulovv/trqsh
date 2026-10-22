import Link from "next/link";
import { ArrowUpRight, Crown, UserPlus, Users } from "lucide-react";
import { api, safe } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { stagger } from "@/lib/utils";

export default async function TeamPage() {
  const [account, subs] = await Promise.all([safe(api.account()), safe(api.subscription())]);
  const plan = subs?.plan ?? "free";
  const isTeam = plan === "team";
  const user = account?.user;
  const org = account?.orgs.find((o) => o.id === account.active_org) ?? account?.orgs[0];

  return (
    <div>
      <PageHeader
        eyebrow="Account"
        title="Team"
        description="Members and roles for your organization."
        action={
          isTeam ? (
            <Button disabled title="Invites arrive with the team endpoints">
              <UserPlus className="h-4 w-4" aria-hidden="true" /> Invite
            </Button>
          ) : undefined
        }
      />

      {!isTeam && (
        <Card spotlight className="rise mb-6">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent">
                <Users className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-medium">Collaborate with your team</p>
                <p className="mt-1 text-sm text-secondary">
                  Invites, roles, and SSO/SAML are part of the Team plan.
                </p>
              </div>
            </div>
            <Link href="/billing" className={buttonVariants()}>
              Upgrade to Team <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
      )}

      <Card className="rise" style={stagger(1)}>
        <CardHeader>
          <CardTitle>{org?.name ?? "Your organization"}</CardTitle>
          <CardDescription>People with access to this organization.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border rounded-xl border border-border">
            <li className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-page"
                >
                  {(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user?.name || "You"}</p>
                  <p className="truncate text-xs text-secondary">{user?.email}</p>
                </div>
              </div>
              <Badge variant="default">
                <Crown className="h-3 w-3" aria-hidden="true" /> Owner
              </Badge>
            </li>
          </ul>
        </CardContent>
      </Card>

      <p className="mt-4 max-w-2xl text-xs leading-relaxed text-muted">
        Member management (invites, roles, SSO) is exposed once the control API adds team endpoints; the
        data model already supports org members and roles.
      </p>
    </div>
  );
}

import { LogOut } from "lucide-react";
import { api, safe } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlanBadge } from "@/components/plan-badge";
import { CopyButton } from "@/components/copy-button";
import { ThemeSegmented } from "@/components/theme-segmented";
import { navItems } from "@/components/nav-config";
import { logout } from "@/app/actions";
import { formatDate } from "@/lib/format";
import { stagger } from "@/lib/utils";

export default async function SettingsPage() {
  const account = await safe(api.account());
  const user = account?.user;
  const org = account?.orgs.find((o) => o.id === account.active_org) ?? account?.orgs[0];

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Account" title="Settings" description="Your account, organization and preferences." />

      <div className="flex flex-col gap-6">
        <Card className="rise">
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Signed in as {user?.email}.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6 flex items-center gap-4">
              {user?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar_url}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-14 w-14 rounded-full border border-border-strong object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-lg font-semibold text-page"
                >
                  {(user?.name || user?.email || "?").charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-base font-semibold tracking-[-0.02em]">{user?.name || "You"}</p>
                <p className="truncate text-sm text-secondary">{user?.email}</p>
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
              <Field label="Sign-in methods" value={signInMethods(account?.providers, user?.oauth_provider)} />
              <Field label="Member since" value={formatDate(user?.created_at)} />
              <Field label="User ID" value={<span className="break-all font-mono text-xs">{user?.id || "—"}</span>} />
            </dl>
          </CardContent>
        </Card>

        <Card className="rise" style={stagger(1)}>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
            <CardDescription>The workspace tunnels, keys and billing belong to.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
              <Field label="Name" value={org?.name || "—"} />
              <Field label="Plan" value={<PlanBadge plan={org?.plan ?? "free"} />} />
              <Field
                label="Organization ID"
                value={
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 break-all font-mono text-xs">{org?.id || "—"}</span>
                    {org?.id && <CopyButton value={org.id} label="" />}
                  </span>
                }
              />
              <Field label="Created" value={formatDate(org?.created_at)} />
            </dl>
          </CardContent>
        </Card>

        <Card className="rise" style={stagger(2)}>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Follow your device, or pick a theme and keep it.</CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeSegmented className="w-full max-w-sm" />
          </CardContent>
        </Card>

        <Card className="rise" style={stagger(3)}>
          <CardHeader>
            <CardTitle>Keyboard shortcuts</CardTitle>
            <CardDescription>Move around without the mouse.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border rounded-xl border border-border text-sm">
              <Shortcut label="Open the command palette" keys={["Ctrl / ⌘", "K"]} />
              <Shortcut label="Search from anywhere" keys={["/"]} />
              {navItems.map((item) => (
                <Shortcut key={item.href} label={`Go to ${item.label}`} keys={["G", item.key.toUpperCase()]} then />
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card className="rise" style={stagger(4)}>
          <CardHeader>
            <CardTitle>Session</CardTitle>
            <CardDescription>Sign out of the dashboard on this device.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={logout}>
              <Button variant="outline" type="submit">
                <LogOut className="h-4 w-4" aria-hidden="true" /> Log out
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const PROVIDER_NAMES: Record<string, string> = { github: "GitHub", google: "Google" };

function signInMethods(providers: string[] | undefined, legacy: string | undefined) {
  const linked = providers?.length ? providers : legacy ? [legacy] : ["email"];
  return linked.map((p) => PROVIDER_NAMES[p] ?? p).join(", ");
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-surface p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

function Shortcut({ label, keys, then }: { label: string; keys: string[]; then?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="text-secondary">{label}</dt>
      <dd className="flex shrink-0 items-center gap-1.5">
        {keys.map((key, i) => (
          <span key={key} className="flex items-center gap-1.5">
            {then && i > 0 && <span className="text-xs text-muted">then</span>}
            <kbd className="kbd">{key}</kbd>
          </span>
        ))}
      </dd>
    </div>
  );
}

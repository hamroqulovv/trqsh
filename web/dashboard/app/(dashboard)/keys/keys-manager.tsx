"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { KeyRound, ShieldAlert } from "lucide-react";
import { createKeyAction, revokeKeyAction, type CreateKeyState } from "./actions";
import type { ApiKey } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CopyButton } from "@/components/copy-button";
import { EmptyState } from "@/components/empty-state";
import { StatusDot } from "@/components/status-dot";
import { useConfirm } from "@/components/confirm";
import { useToast } from "@/components/toast";
import { formatDate, timeAgo } from "@/lib/format";
import { cn, stagger } from "@/lib/utils";

export function KeysManager({ keys }: { keys: ApiKey[] }) {
  const [state, action, pending] = useActionState<CreateKeyState, FormData>(createKeyAction, {});
  const [name, setName] = useState("");
  const [shown, setShown] = useState<CreateKeyState | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  // Report each result once, and clear the field only when the key was made.
  useEffect(() => {
    if (state.key) {
      setName("");
      setShown(state);
      toast({ title: "API key created", description: state.name, tone: "success" });
    } else if (state.error) {
      toast({ title: "Could not create key", description: state.error, tone: "error" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Live keys first; newest first within each group (the page already sorts by date).
  const sorted = useMemo(
    () => [...keys].sort((a, b) => Number(!!a.revoked_at) - Number(!!b.revoked_at)),
    [keys],
  );
  const active = keys.filter((k) => !k.revoked_at).length;

  async function revoke(key: ApiKey) {
    const ok = await confirm({
      title: `Revoke “${key.name || key.prefix}”?`,
      description: "Agents using this key will stop connecting straight away. This can't be undone.",
      confirmLabel: "Revoke key",
      tone: "danger",
    });
    if (!ok) return;
    setRevoking(key.id);
    const result = await revokeKeyAction(key.id);
    setRevoking(null);
    if (result.ok) {
      // A key that was just created may still be on screen in the reveal panel.
      if (shown?.prefix === key.prefix) setShown(null);
      toast({ title: "Key revoked", description: key.name || key.prefix, tone: "success" });
    } else toast({ title: "Could not revoke key", description: result.error, tone: "error" });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="rise">
        <CardHeader>
          <CardTitle>Create an API key</CardTitle>
          <CardDescription>
            Use it with <code className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs">trqsh login --key</code> or
            the <code className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs">TRQSH_API_KEY</code> env var.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="key-name">
                Name
              </label>
              <Input
                id="key-name"
                name="name"
                placeholder="laptop, ci, …"
                autoComplete="off"
                maxLength={64}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button type="submit" loading={pending}>
              {pending ? "Creating…" : "Create key"}
            </Button>
          </form>

          {state.error && (
            <p role="alert" className="mt-3 text-sm font-medium">
              {state.error}
            </p>
          )}

          {shown?.key && (
            <div role="status" className="rise-sm mt-5 rounded-xl border border-foreground/30 bg-accent/60 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Copy your key now — it won&apos;t be shown again.</p>
                  <p className="mt-0.5 text-xs text-secondary">Store it somewhere safe, like a password manager.</p>
                </div>
              </div>
              <div className="command-line mt-3 flex items-center justify-between gap-2 rounded-lg border border-border bg-surface py-1.5 pl-3 pr-1.5">
                <code className="min-w-0 flex-1 break-all font-mono text-xs">{shown.key}</code>
                <CopyButton value={shown.key} label="Copy key" />
              </div>
              <div className="mt-3 flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShown(null)}>
                  I&apos;ve saved it
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {keys.length === 0 ? (
        <EmptyState
          className="rise"
          icon={KeyRound}
          title="No API keys yet"
          description="Create one above to connect the CLI or desktop app."
        />
      ) : (
        <Card className="rise overflow-hidden" style={stagger(1)}>
          <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3.5 sm:px-5">
            <p className="text-sm font-medium">Your keys</p>
            <p className="text-xs tabular text-secondary">
              {active} active{keys.length > active && <span className="text-muted"> · {keys.length - active} revoked</span>}
            </p>
          </div>

          <ul className="divide-y divide-border md:hidden">
            {sorted.map((k, i) => (
              <li key={k.id} className={cn("rise-sm p-4", k.revoked_at && "opacity-60")} style={stagger(i)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={cn("truncate text-sm font-medium", k.revoked_at && "line-through")}>{k.name || "—"}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted">{k.prefix}…</p>
                  </div>
                  <KeyStatus revoked={!!k.revoked_at} />
                </div>
                <p className="mt-3 text-xs text-secondary">
                  Last used {timeAgo(k.last_used_at)} <span className="text-muted">· created {formatDate(k.created_at)}</span>
                </p>
                {!k.revoked_at && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    loading={revoking === k.id}
                    onClick={() => revoke(k)}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Name</TH>
                  <TH>Prefix</TH>
                  <TH>Last used</TH>
                  <TH>Created</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {sorted.map((k, i) => (
                  <TR key={k.id} className={cn("rise-sm", k.revoked_at && "opacity-60")} style={stagger(i)}>
                    <TD className={cn("font-medium", k.revoked_at && "line-through")}>{k.name || "—"}</TD>
                    <TD className="font-mono text-xs text-secondary">{k.prefix}…</TD>
                    <TD className="text-secondary">{timeAgo(k.last_used_at)}</TD>
                    <TD className="text-secondary">{formatDate(k.created_at)}</TD>
                    <TD>
                      <KeyStatus revoked={!!k.revoked_at} />
                    </TD>
                    <TD className="text-right">
                      {!k.revoked_at && (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={revoking === k.id}
                          onClick={() => revoke(k)}
                          aria-label={`Revoke ${k.name || k.prefix}`}
                        >
                          Revoke
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

function KeyStatus({ revoked }: { revoked: boolean }) {
  return revoked ? (
    <Badge variant="muted">
      <StatusDot state="off" /> Revoked
    </Badge>
  ) : (
    <Badge variant="good">
      <StatusDot pulse={false} /> Active
    </Badge>
  );
}

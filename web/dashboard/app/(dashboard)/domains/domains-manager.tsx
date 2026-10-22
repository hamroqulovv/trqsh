"use client";

import { useActionState, useEffect, useState } from "react";
import { ChevronDown, Globe, Plus, ShieldCheck, Trash2 } from "lucide-react";
import {
  addDomainAction,
  releaseSubdomainAction,
  reserveSubdomainAction,
  verifyDomainAction,
  type AddDomainState,
  type ReserveState,
} from "./actions";
import type { CustomDomain, ReservedSubdomain } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/copy-button";
import { StatusDot } from "@/components/status-dot";
import { useConfirm } from "@/components/confirm";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/format";
import { cn, stagger } from "@/lib/utils";

export function DomainsManager({
  subdomains,
  domains,
  baseDomain,
}: {
  subdomains: ReservedSubdomain[];
  domains: CustomDomain[];
  baseDomain: string;
}) {
  const [subState, reserveAction, reserving] = useActionState<ReserveState, FormData>(reserveSubdomainAction, {});
  const [domState, addAction, adding] = useActionState<AddDomainState, FormData>(addDomainAction, {});
  const [sub, setSub] = useState("");
  const [domain, setDomain] = useState("");
  const [releasing, setReleasing] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    if (subState.ok) {
      setSub("");
      toast({ title: "Subdomain reserved", description: `${subState.subdomain}.${baseDomain}`, tone: "success" });
    } else if (subState.error) {
      toast({ title: "Could not reserve subdomain", description: subState.error, tone: "error" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subState]);

  useEffect(() => {
    if (domState.dns) {
      setDomain("");
      toast({ title: "Domain added", description: "Add the DNS records below, then verify.", tone: "success" });
    } else if (domState.error) {
      toast({ title: "Could not add domain", description: domState.error, tone: "error" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domState]);

  async function release(s: ReservedSubdomain) {
    const name = `${s.subdomain}.${baseDomain}`;
    const ok = await confirm({
      title: `Release ${name}?`,
      description: "Anyone could claim this name afterwards, and tunnels using it will stop working.",
      confirmLabel: "Release",
      tone: "danger",
    });
    if (!ok) return;
    setReleasing(s.id);
    const result = await releaseSubdomainAction(s.id);
    setReleasing(null);
    if (result.ok) toast({ title: "Subdomain released", description: name, tone: "success" });
    else toast({ title: "Could not release subdomain", description: result.error, tone: "error" });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="rise">
        <CardHeader>
          <CardTitle>Reserved subdomains</CardTitle>
          <CardDescription>
            Claim a stable name like{" "}
            <span className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs">myapp.{baseDomain}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={reserveAction} className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
              <label htmlFor="subdomain" className="text-sm font-medium">
                Subdomain
              </label>
              <div className="flex h-10 items-center overflow-hidden rounded-md border border-border-strong bg-surface pr-3 transition-[border-color,box-shadow] duration-200 hover:border-foreground/40 focus-within:border-foreground/60 focus-within:ring-2 focus-within:ring-foreground/15 sm:h-9">
                <Input
                  id="subdomain"
                  name="subdomain"
                  placeholder="myapp"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={sub}
                  onChange={(e) => setSub(e.target.value)}
                  className="h-full border-0 hover:border-0 focus-visible:ring-0"
                />
                <span className="whitespace-nowrap text-sm text-muted">.{baseDomain}</span>
              </div>
            </div>
            <Button type="submit" loading={reserving}>
              {reserving ? "Reserving…" : "Reserve"}
            </Button>
          </form>
          {subState.error && (
            <p role="alert" className="mt-3 text-sm font-medium">
              {subState.error}
            </p>
          )}

          <ul className="mt-5 divide-y divide-border rounded-xl border border-border">
            {subdomains.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-secondary">
                No reserved subdomains yet. Reserve one so your URL stays the same between runs.
              </li>
            ) : (
              subdomains.map((s, i) => (
                <li key={s.id} className="rise-sm flex items-center justify-between gap-3 px-4 py-3" style={stagger(i)}>
                  <div className="flex min-w-0 items-center gap-3">
                    <Globe className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm">
                        {s.subdomain}.{baseDomain}
                      </p>
                      <p className="text-xs text-muted">Reserved {timeAgo(s.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <CopyButton value={`${s.subdomain}.${baseDomain}`} label="" />
                    <Button
                      variant="ghost"
                      size="icon"
                      loading={releasing === s.id}
                      onClick={() => release(s)}
                      aria-label={`Release ${s.subdomain}.${baseDomain}`}
                      className="h-9 w-9 sm:h-8 sm:w-8"
                    >
                      {releasing !== s.id && <Trash2 className="h-4 w-4" aria-hidden="true" />}
                    </Button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>

      <Card className="rise" style={stagger(1)}>
        <CardHeader>
          <CardTitle>Custom domains</CardTitle>
          <CardDescription>Bring your own domain. Add the DNS records, then verify.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={addAction} className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
              <label htmlFor="domain" className="text-sm font-medium">
                Domain
              </label>
              <Input
                id="domain"
                name="domain"
                placeholder="app.example.com"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
            </div>
            <Button type="submit" loading={adding}>
              {!adding && <Plus className="h-4 w-4" aria-hidden="true" />}
              {adding ? "Adding…" : "Add domain"}
            </Button>
          </form>
          {domState.error && (
            <p role="alert" className="mt-3 text-sm font-medium">
              {domState.error}
            </p>
          )}
          {domState.dns && (
            <div className="rise-sm mt-5 rounded-xl border border-foreground/30 bg-accent/60 p-4">
              <p className="mb-3 text-sm font-medium">
                Add these DNS records for <span className="font-mono">{domState.domain}</span>
              </p>
              <DnsRecords
                records={[
                  { type: "TXT", name: domState.dns.txt_name, value: domState.dns.txt_value },
                  { type: "CNAME", name: domState.dns.cname_name, value: domState.dns.cname_value },
                ]}
              />
            </div>
          )}

          <ul className="mt-5 divide-y divide-border rounded-xl border border-border">
            {domains.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-secondary">
                No custom domains yet. Add one to serve tunnels from your own hostname.
              </li>
            ) : (
              domains.map((d, i) => (
                <DomainRow key={d.id} domain={d} baseDomain={baseDomain} index={i} />
              ))
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function DomainRow({ domain, baseDomain, index }: { domain: CustomDomain; baseDomain: string; index: number }) {
  const [open, setOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const toast = useToast();
  const verified = !!domain.verified_at;

  async function verify() {
    setVerifying(true);
    const result = await verifyDomainAction(domain.id);
    setVerifying(false);
    if (result.ok) toast({ title: "Domain verified", description: domain.domain, tone: "success" });
    else toast({ title: "Not verified yet", description: result.error, tone: "error" });
  }

  return (
    <li className="rise-sm px-4 py-3.5" style={stagger(index)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <Globe className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          <span className="min-w-0 break-all font-mono text-sm">{domain.domain}</span>
          {verified ? (
            <Badge variant="good">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Verified
            </Badge>
          ) : (
            <Badge variant="warning">
              <StatusDot state="pending" /> Pending
            </Badge>
          )}
          <Badge variant="muted">cert: {domain.cert_status}</Badge>
        </div>
        {!verified && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={open}
              aria-controls={`dns-${domain.id}`}
              onClick={() => setOpen((v) => !v)}
            >
              DNS records
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform duration-300", open && "rotate-180")}
                aria-hidden="true"
              />
            </Button>
            <Button type="button" variant="outline" size="sm" loading={verifying} onClick={verify}>
              Verify
            </Button>
          </div>
        )}
      </div>
      {!verified && (
        <div id={`dns-${domain.id}`} className="expander" data-open={open} inert={!open}>
          <div>
            <div className="mt-3 rounded-xl border border-border bg-page p-4">
              <DnsRecords
                records={[
                  { type: "TXT", name: `_trqsh-challenge.${domain.domain}`, value: domain.verify_token },
                  { type: "CNAME", name: domain.domain, value: baseDomain },
                ]}
              />
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function DnsRecords({ records }: { records: { type: string; name: string; value: string }[] }) {
  return (
    <dl className="flex flex-col divide-y divide-border">
      {records.map((r) => (
        <div key={r.type} className="grid grid-cols-1 gap-x-4 gap-y-1.5 py-3 first:pt-0 last:pb-0 sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)]">
          <dt>
            <Badge variant="outline" className="w-16 justify-center">
              {r.type}
            </Badge>
          </dt>
          <dd className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 break-all font-mono text-xs text-secondary">
              <span className="mr-2 text-muted">Name</span>
              {r.name}
            </span>
            <CopyButton value={r.name} label="" className="ml-auto" />
          </dd>
          <dd className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 break-all font-mono text-xs text-secondary">
              <span className="mr-2 text-muted">Value</span>
              {r.value}
            </span>
            <CopyButton value={r.value} label="" className="ml-auto" />
          </dd>
        </div>
      ))}
    </dl>
  );
}

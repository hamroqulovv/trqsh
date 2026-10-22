import { ArrowUpRight, Network } from "lucide-react";
import { api, safe, type Tunnel } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { LiveRefresh } from "@/components/live-refresh";
import { LoadError } from "@/components/load-error";
import { StatusDot } from "@/components/status-dot";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CopyButton } from "@/components/copy-button";
import { formatBytes, formatNumber } from "@/lib/format";
import { stagger } from "@/lib/utils";

export default async function TunnelsPage() {
  const loaded = await safe(api.tunnels());
  const tunnels = loaded ?? [];
  const totalIn = tunnels.reduce((sum, t) => sum + (t.bytes_in ?? 0), 0);
  const totalOut = tunnels.reduce((sum, t) => sum + (t.bytes_out ?? 0), 0);

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Tunnels"
        description="Live tunnels served by the edge for your account."
        action={<LiveRefresh />}
      />

      {loaded === null ? (
        <LoadError what="your tunnels" />
      ) : tunnels.length === 0 ? (
        <EmptyState
          className="rise"
          icon={Network}
          title="No active tunnels"
          description="Start one from your terminal. It appears here the moment the agent connects."
          command="trqsh http 3000"
        />
      ) : (
        <Card className="rise overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-border px-4 py-3.5 sm:px-5">
            <p className="flex items-center gap-2.5 text-sm font-medium">
              <StatusDot />
              {tunnels.length} live {tunnels.length === 1 ? "tunnel" : "tunnels"}
            </p>
            <p className="text-xs tabular text-secondary">
              {formatBytes(totalIn)} in <span className="text-muted">·</span> {formatBytes(totalOut)} out
            </p>
          </div>

          {/* Phones get one card per tunnel; wider screens get the table. */}
          <ul className="divide-y divide-border md:hidden">
            {tunnels.map((t, i) => (
              <li key={t.id} className="rise-sm p-4" style={stagger(i)}>
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="outline" className="uppercase">
                    {t.proto}
                  </Badge>
                  <span className="text-xs text-muted">{t.region || "—"}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <PublicUrl tunnel={t} />
                  <CopyButton value={t.public_url} label="" />
                </div>
                <p className="mt-1 truncate font-mono text-xs text-muted">→ {t.local_addr}</p>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <Metric label="In" value={formatBytes(t.bytes_in ?? 0)} />
                  <Metric label="Out" value={formatBytes(t.bytes_out ?? 0)} />
                  <Metric label="Requests" value={formatNumber(t.requests ?? 0)} />
                </dl>
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Proto</TH>
                  <TH>Public URL</TH>
                  <TH>Local</TH>
                  <TH>Region</TH>
                  <TH className="text-right">In</TH>
                  <TH className="text-right">Out</TH>
                  <TH className="text-right">Reqs</TH>
                </TR>
              </THead>
              <TBody>
                {tunnels.map((t, i) => (
                  <TR key={t.id} className="rise-sm" style={stagger(i)}>
                    <TD>
                      <Badge variant="outline" className="uppercase">
                        {t.proto}
                      </Badge>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <PublicUrl tunnel={t} />
                        <CopyButton value={t.public_url} label="" />
                      </div>
                    </TD>
                    <TD className="font-mono text-xs text-secondary">{t.local_addr}</TD>
                    <TD className="text-secondary">{t.region || "—"}</TD>
                    <TD className="text-right tabular text-secondary">{formatBytes(t.bytes_in ?? 0)}</TD>
                    <TD className="text-right tabular text-secondary">{formatBytes(t.bytes_out ?? 0)}</TD>
                    <TD className="text-right tabular text-secondary">{formatNumber(t.requests ?? 0)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
      )}

      <p className="mt-4 max-w-2xl text-xs leading-relaxed text-muted">
        The live tunnel list is served by the edge registry via the control API. It populates once an
        agent connects and binds a tunnel.
      </p>
    </div>
  );
}

function PublicUrl({ tunnel }: { tunnel: Tunnel }) {
  const web = /^https?:\/\//.test(tunnel.public_url);
  const className = "group/url inline-flex min-w-0 items-center gap-1 font-mono text-xs";
  return web ? (
    <a
      href={tunnel.public_url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${className} hover:underline hover:underline-offset-4`}
    >
      <span className="truncate">{tunnel.public_url}</span>
      <ArrowUpRight
        className="h-3 w-3 shrink-0 text-muted transition-transform duration-300 group-hover/url:-translate-y-0.5 group-hover/url:translate-x-0.5"
        aria-hidden="true"
      />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  ) : (
    <span className={className}>
      <span className="truncate">{tunnel.public_url}</span>
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-accent px-2.5 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium tabular">{value}</dd>
    </div>
  );
}

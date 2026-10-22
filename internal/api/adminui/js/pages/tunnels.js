import { el, icon, fmtBytes, fmtNum, fmtDateTime, fmtDuration, timeEl, openDialog } from "../dom.js";
import { api, A } from "../api.js";
import { createList, ccBadge, dot, offBadge, kv, copyChip } from "../kit.js";

function show(t) {
  const live = t.status === "active";
  openDialog({
    title: "Tunnel session",
    wide: true,
    body: el(
      "div",
      { class: "modal-body" },
      kv([
        ["Public URL", t.public_url ? el("a", { href: t.public_url, target: "_blank", rel: "noopener noreferrer", class: "mono" }, t.public_url, icon("external")) : null],
        ["Status", live ? el("span", { class: "badge" }, dot("", true), "Live") : offBadge("Closed")],
        ["Type", el("span", { class: "badge" }, t.type)],
        ["Region", t.region || null],
        ["Agent location", el("span", { class: "cell-main" }, ccBadge(t.country), t.city || "")],
        ["Agent IP", t.client_ip ? copyChip(t.client_ip) : null],
        ["Organization", el("a", { href: `#/orgs/${encodeURIComponent(t.org_id)}`, class: "mono" }, t.org_id)],
        ["Started", fmtDateTime(t.started_at)],
        ["Ended", t.ended_at ? fmtDateTime(t.ended_at) : null],
        ["Duration", fmtDuration(t.started_at, t.ended_at)],
        ["Inbound", fmtBytes(t.bytes_in)],
        ["Outbound", fmtBytes(t.bytes_out)],
        ["Requests", fmtNum(t.requests)],
        ["Edge / session", el("code", { class: "muted" }, `${t.edge_id || "—"} / ${t.session_id || "—"}`)],
        ["Tunnel ID", copyChip(t.tunnel_id)],
      ]),
    ),
  });
}

export default async function mount(host) {
  host.append(el("div", { class: "page-head" }, el("div", {}, el("h1", {}, "Tunnels"), el("p", { class: "lede" }, "Every tunnel session across all organizations, live and historical, with where the agent connected from."))));
  let regions = [];
  try {
    regions = (await api.get(`${A}/stats`)).regions || [];
  } catch {
    /* the region filter simply stays empty */
  }
  const list = createList({
    endpoint: "/v1/admin/tunnels",
    key: "sessions",
    live: 5000,
    filters: [
      { kind: "search", name: "q", placeholder: "Search URL, host, IP or org ID…" },
      { kind: "seg", name: "active", label: "State", default: "", options: [{ value: "", label: "All" }, { value: "true", label: "Live" }] },
      { kind: "select", name: "type", label: "Type", options: [{ value: "", label: "Any type" }, ...["http", "https", "tls", "tcp", "udp"].map((t) => ({ value: t, label: t }))] },
      { kind: "select", name: "region", label: "Region", options: [{ value: "", label: "Any region" }, ...regions.map((r) => ({ value: r.code, label: `${r.code} · ${r.name}` }))] },
    ],
    onRow: show,
    columns: [
      { label: "Public URL", render: (t) => el("span", { class: "mono cell-title" }, (t.public_url || "—").replace(/^https?:\/\//, "")) },
      { label: "Type", render: (t) => el("span", { class: "badge" }, t.type) },
      { label: "Region", render: (t) => t.region || null },
      { label: "From", render: (t) => el("span", { class: "cell-main" }, ccBadge(t.country), t.city ? el("span", { class: "muted" }, t.city) : null) },
      { label: "Agent IP", render: (t) => (t.client_ip ? el("code", { class: "muted" }, t.client_ip) : null) },
      { label: "Org", render: (t) => el("a", { href: `#/orgs/${encodeURIComponent(t.org_id)}`, class: "mono muted" }, t.org_id.slice(0, 14)) },
      { label: "In / out", num: true, render: (t) => `${fmtBytes(t.bytes_in)} / ${fmtBytes(t.bytes_out)}` },
      { label: "Requests", num: true, render: (t) => fmtNum(t.requests) },
      { label: "Started", render: (t) => timeEl(t.started_at) },
      { label: "Status", render: (t) => (t.status === "active" ? el("span", { class: "badge" }, dot("", true), "Live") : offBadge("Closed")) },
    ],
    empty: ["radio", "No tunnel sessions", "Sessions appear when an agent binds a tunnel."],
  });
  // The API filters on `active=true`; the seg control uses "" for "all".
  host.append(list.node);
  return list.destroy;
}

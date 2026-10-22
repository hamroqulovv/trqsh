import { el, timeEl, fmtDateTime, openDialog } from "../dom.js";
import { createList, kv, copyChip } from "../kit.js";

// Every action the API writes, so the filter lists them even before one occurs.
const ACTIONS = [
  "user.rename", "user.disable", "user.enable", "user.delete",
  "org.rename", "org.plan", "org.suspend", "org.unsuspend", "org.delete",
  "org.member.add", "org.member.role", "org.member.remove",
  "apikey.revoke", "subdomain.reserve", "subdomain.release", "domain.verify", "domain.delete",
];

export function targetHref(type, id) {
  if (!id) return null;
  if (type === "user") return `#/users/${encodeURIComponent(id)}`;
  if (type === "org") return `#/orgs/${encodeURIComponent(id)}`;
  return null;
}

export function actionBadge(action) {
  const destructive = /delete|revoke|disable|suspend$|release|remove/.test(action);
  return el("span", { class: "badge" + (destructive ? " badge-hatch" : ""), title: destructive ? "Restrictive or destructive action" : "" }, action);
}

// One timeline row (used by the overview and the detail pages).
export function auditEntry(e) {
  const href = targetHref(e.target_type, e.target_id);
  return el(
    "li",
    {},
    el("div", {}, actionBadge(e.action), " ", el("span", {}, e.summary || "")),
    el("div", { class: "when" }, e.actor || "admin", " · ", timeEl(e.at), href ? [" · ", el("a", { href, class: "mono" }, e.target_id)] : null),
  );
}

function showEntry(e) {
  const body = el(
    "div",
    { class: "modal-body" },
    kv([
      ["When", fmtDateTime(e.at)],
      ["Actor", e.actor || "admin"],
      ["Action", actionBadge(e.action)],
      ["Target", el("span", {}, `${e.target_type || "—"} `, copyChip(e.target_id))],
      ["Summary", e.summary],
      ["IP address", e.ip ? el("code", {}, e.ip) : null],
    ]),
    e.detail && Object.keys(e.detail).length ? el("div", { class: "field" }, el("span", { class: "label" }, "Detail"), el("pre", { class: "json" }, JSON.stringify(e.detail, null, 2))) : null,
  );
  openDialog({ title: "Audit entry", body, wide: true });
}

export default async function mount(host) {
  host.append(
    el("div", { class: "page-head" }, el("div", {}, el("h1", {}, "Audit log"), el("p", { class: "lede" }, "Every change made from this console: who did it, to what, and from where. Entries can't be edited or deleted."))),
  );
  const list = createList({
    endpoint: "/v1/admin/audit",
    key: "entries",
    limit: 30,
    filters: [
      { kind: "search", name: "q", placeholder: "Search actions, targets, summaries…" },
      { kind: "select", name: "action", label: "Action", options: [{ value: "", label: "All actions" }, ...ACTIONS.map((a) => ({ value: a, label: a }))] },
    ],
    columns: [
      { label: "When", render: (e) => el("span", { class: "nowrap" }, timeEl(e.at)) },
      { label: "Actor", render: (e) => e.actor || "admin" },
      { label: "Action", render: (e) => actionBadge(e.action) },
      { label: "Target", render: (e) => (targetHref(e.target_type, e.target_id) ? el("a", { href: targetHref(e.target_type, e.target_id), class: "mono" }, e.target_id) : el("span", { class: "mono muted" }, e.target_id || "—")) },
      { label: "Summary", render: (e) => el("span", { class: "cell-title" }, e.summary) },
      { label: "IP", render: (e) => (e.ip ? el("code", { class: "muted" }, e.ip) : null) },
    ],
    onRow: showEntry,
    empty: ["scroll", "No admin activity yet", "Changes made from this console will show up here."],
  });
  host.append(list.node);
  return list.destroy;
}

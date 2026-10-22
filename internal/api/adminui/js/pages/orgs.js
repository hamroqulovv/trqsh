import { el, timeEl } from "../dom.js";
import { createList, planBadge, suspendedBadge, activeBadge } from "../kit.js";

export default async function mount(host) {
  host.append(el("div", { class: "page-head" }, el("div", {}, el("h1", {}, "Organizations"), el("p", { class: "lede" }, "The billing and ownership unit. Plans, limits, keys, domains and tunnels all hang off an organization."))));
  const list = createList({
    endpoint: "/v1/admin/orgs",
    key: "orgs",
    filters: [
      { kind: "search", name: "q", placeholder: "Search by name or ID…" },
      { kind: "select", name: "plan", label: "Plan", options: [{ value: "", label: "All plans" }, { value: "free", label: "Free" }, { value: "pro", label: "Pro" }, { value: "team", label: "Team" }, { value: "payg", label: "Pay-as-you-go" }] },
    ],
    href: (o) => `#/orgs/${encodeURIComponent(o.id)}`,
    columns: [
      { label: "Organization", render: (o) => el("div", { class: "cell-text" }, el("span", { class: "cell-title" }, o.name || "—"), el("span", { class: "cell-sub mono" }, o.id)) },
      { label: "Plan", render: (o) => planBadge(o.plan, o.plan_expires_at) },
      { label: "Members", num: true, render: (o) => o.members },
      { label: "Status", render: (o) => (o.suspended_at ? suspendedBadge("Suspended", o.suspended_reason) : activeBadge()) },
      { label: "Created", render: (o) => timeEl(o.created_at) },
    ],
    empty: ["building", "No organizations", "They are created automatically when someone signs up."],
  });
  host.append(list.node);
  return list.destroy;
}

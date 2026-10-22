import { el, timeEl } from "../dom.js";
import { createList, avatar, planBadge, suspendedBadge, activeBadge } from "../kit.js";

export default async function mount(host) {
  host.append(el("div", { class: "page-head" }, el("div", {}, el("h1", {}, "Users"), el("p", { class: "lede" }, "Every account on the platform. Open one to see its organizations, suspend it, or delete it."))));
  const list = createList({
    endpoint: "/v1/admin/users",
    key: "users",
    filters: [{ kind: "search", name: "q", placeholder: "Search by name or email…" }],
    href: (u) => `#/users/${encodeURIComponent(u.id)}`,
    columns: [
      {
        label: "User",
        render: (u) => el("div", { class: "cell-main" }, avatar(u.name || u.email), el("div", { class: "cell-text" }, el("span", { class: "cell-title" }, u.name || u.email.split("@")[0]), el("span", { class: "cell-sub" }, u.email))),
      },
      { label: "Plan", render: (u) => (u.plan ? planBadge(u.plan, u.plan_expires_at) : null) },
      { label: "Orgs", num: true, render: (u) => u.orgs ?? 0 },
      { label: "Sign-in", render: (u) => el("span", { class: "muted" }, u.oauth_provider || "email") },
      { label: "Status", render: (u) => (u.disabled_at ? suspendedBadge("Suspended", u.disabled_reason) : activeBadge()) },
      { label: "Joined", render: (u) => timeEl(u.created_at) },
    ],
    empty: ["users", "No users yet", "Accounts appear here as people sign in."],
  });
  host.append(list.node);
  return list.destroy;
}

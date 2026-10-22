import { el, icon, toast, confirmDialog, timeEl } from "../dom.js";
import { api, A } from "../api.js";
import { createList, activeBadge, offBadge, link } from "../kit.js";

export default async function mount(host) {
  host.append(el("div", { class: "page-head" }, el("div", {}, el("h1", {}, "API keys"), el("p", { class: "lede" }, "Agent credentials across every organization. Only the key prefix is stored in readable form; the secret is hashed and can't be shown again."))));
  let list;
  const revoke = async (k) => {
    const ok = await confirmDialog({ title: "Revoke API key?", message: `“${k.name || k.prefix}” (${k.org_name}) stops working immediately. Agents using it will be rejected.`, confirmLabel: "Revoke key", danger: true });
    if (!ok) return;
    try {
      await api.del(`${A}/api-keys/${encodeURIComponent(k.id)}`);
      toast("Key revoked");
      list.reload();
    } catch (e) {
      toast(e.message, "error");
    }
  };
  list = createList({
    endpoint: "/v1/admin/api-keys",
    key: "keys",
    filters: [
      { kind: "search", name: "q", placeholder: "Search name, prefix or organization…" },
      { kind: "seg", name: "state", label: "State", default: "", options: [{ value: "", label: "All" }, { value: "active", label: "Active" }, { value: "revoked", label: "Revoked" }] },
    ],
    columns: [
      { label: "Name", render: (k) => el("span", { class: "cell-title" }, k.name || "—") },
      { label: "Prefix", render: (k) => el("code", {}, k.prefix) },
      { label: "Organization", render: (k) => link(`#/orgs/${encodeURIComponent(k.org_id)}`, k.org_name || k.org_id, "cell-title") },
      { label: "Last used", render: (k) => (k.last_used_at ? timeEl(k.last_used_at) : el("span", { class: "muted" }, "never")) },
      { label: "Created", render: (k) => timeEl(k.created_at) },
      { label: "Status", render: (k) => (k.revoked_at ? offBadge("Revoked") : activeBadge()) },
      { label: "", render: (k) => (k.revoked_at ? null : el("div", { class: "cell-actions" }, el("button", { class: "btn btn-ghost btn-sm", type: "button", onClick: () => revoke(k) }, icon("ban"), "Revoke"))) },
    ],
    empty: ["key", "No API keys", "Keys are created from the dashboard or the CLI login."],
  });
  host.append(list.node);
  return list.destroy;
}

import { el, icon, clear, toast, confirmDialog, timeEl } from "../dom.js";
import { api, A } from "../api.js";
import { createList, tabs, activeBadge, pendingBadge, copyChip, link } from "../kit.js";

export default async function mount(host) {
  host.append(el("div", { class: "page-head" }, el("div", {}, el("h1", {}, "Domains"), el("p", { class: "lede" }, "Custom domains customers have connected and the subdomains they have reserved. Reserve one for an organization from its page."))));
  const slot = el("div");
  let current = new URLSearchParams(location.hash.split("?")[1] || "").get("tab") === "subdomains" ? "subdomains" : "domains";
  let list = null;

  const act = async (fn, ok) => {
    try {
      await fn();
      toast(ok);
      list.reload();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  function domainsList() {
    return createList({
      endpoint: "/v1/admin/domains",
      key: "domains",
      filters: [
        { kind: "search", name: "q", placeholder: "Search domain or organization…" },
        { kind: "seg", name: "status", label: "Status", default: "", options: [{ value: "", label: "All" }, { value: "verified", label: "Verified" }, { value: "pending", label: "Pending" }] },
      ],
      columns: [
        { label: "Domain", render: (d) => el("code", { class: "cell-title" }, d.domain) },
        { label: "Organization", render: (d) => link(`#/orgs/${encodeURIComponent(d.org_id)}`, d.org_name || d.org_id) },
        { label: "Status", render: (d) => (d.verified_at ? activeBadge("Verified") : pendingBadge("Pending DNS")) },
        { label: "Certificate", render: (d) => el("span", { class: "muted" }, d.cert_status) },
        { label: "TXT token", render: (d) => (d.verified_at ? null : copyChip(d.verify_token, "copy token")) },
        { label: "Added", render: (d) => timeEl(d.created_at) },
        {
          label: "",
          render: (d) =>
            el(
              "div",
              { class: "cell-actions" },
              d.verified_at
                ? null
                : el(
                    "button",
                    {
                      class: "btn btn-ghost btn-sm",
                      type: "button",
                      onClick: async () => (await confirmDialog({ title: "Mark domain verified?", message: `${d.domain} is marked verified without a DNS check. Only do this if ownership was proven another way.`, confirmLabel: "Mark verified" })) && act(() => api.post(`${A}/domains/${encodeURIComponent(d.id)}/verify`), "Domain verified"),
                    },
                    icon("check"),
                    "Verify",
                  ),
              el(
                "button",
                {
                  class: "btn btn-ghost btn-sm btn-icon",
                  type: "button",
                  "aria-label": "Delete domain",
                  onClick: async () => (await confirmDialog({ title: "Delete domain?", message: `${d.domain} stops routing to ${d.org_name}'s tunnels.`, confirmLabel: "Delete domain", danger: true })) && act(() => api.del(`${A}/domains/${encodeURIComponent(d.id)}`), "Domain deleted"),
                },
                icon("trash"),
              ),
            ),
        },
      ],
      empty: ["globe", "No custom domains", "Customers on paid plans can connect their own domains."],
    });
  }

  function subdomainsList() {
    return createList({
      endpoint: "/v1/admin/subdomains",
      key: "subdomains",
      filters: [{ kind: "search", name: "q", placeholder: "Search subdomain or organization…" }],
      columns: [
        { label: "Subdomain", render: (s) => el("code", { class: "cell-title" }, s.subdomain) },
        { label: "Organization", render: (s) => link(`#/orgs/${encodeURIComponent(s.org_id)}`, s.org_name || s.org_id) },
        { label: "Reserved", render: (s) => timeEl(s.created_at) },
        {
          label: "",
          render: (s) =>
            el(
              "div",
              { class: "cell-actions" },
              el(
                "button",
                {
                  class: "btn btn-ghost btn-sm",
                  type: "button",
                  onClick: async () => (await confirmDialog({ title: "Release subdomain?", message: `${s.subdomain} becomes available to anyone.`, confirmLabel: "Release", danger: true })) && act(() => api.del(`${A}/subdomains/${encodeURIComponent(s.id)}`), "Subdomain released"),
                },
                "Release",
              ),
            ),
        },
      ],
      empty: ["link", "No reserved subdomains", "Paid plans can reserve stable subdomains."],
    });
  }

  function show(tab, initial = false) {
    current = tab;
    list?.destroy();
    // The previous tab's filters must not leak into this one.
    if (!initial) history.replaceState(null, "", `#/domains${tab === "subdomains" ? "?tab=subdomains" : ""}`);
    list = tab === "subdomains" ? subdomainsList() : domainsList();
    clear(slot).append(list.node);
  }

  host.append(tabs({ items: [{ value: "domains", label: "Custom domains", icon: "globe" }, { value: "subdomains", label: "Reserved subdomains", icon: "link" }], value: current, onChange: show }), slot);
  show(current, true);
  return () => list?.destroy();
}

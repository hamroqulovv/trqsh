import { el, icon, fill, fmtNum, fmtBytes, fmtDate, fmtDateTime, timeEl, toast, formDialog } from "../dom.js";
import { api, A } from "../api.js";
import { createList, tabs, card, planBadge, statTile, dataTable, errorState, emptyState, link } from "../kit.js";

export default async function mount(host) {
  host.append(el("div", { class: "page-head" }, el("div", {}, el("h1", {}, "Billing"), el("p", { class: "lede" }, "Stripe subscriptions, the metering queue and the plan catalog. Grant a plan by email without a subscription."))));
  const slot = el("div", { class: "stack" });
  let current = new URLSearchParams(location.hash.split("?")[1] || "").get("tab") || "subscriptions";
  let list = null;

  function subscriptions() {
    return createList({
      endpoint: "/v1/admin/subscriptions",
      key: "subscriptions",
      filters: [
        { kind: "search", name: "q", placeholder: "Search organization, Stripe ID…" },
        { kind: "select", name: "status", label: "Status", options: [{ value: "", label: "Any status" }, ...["active", "trialing", "past_due", "canceled", "incomplete"].map((s) => ({ value: s, label: s }))] },
      ],
      href: (s) => `#/orgs/${encodeURIComponent(s.org_id)}`,
      columns: [
        { label: "Organization", render: (s) => el("span", { class: "cell-title" }, s.org_name || s.org_id) },
        { label: "Plan", render: (s) => planBadge(s.plan) },
        { label: "Status", render: (s) => el("span", { class: "badge" + (["active", "trialing"].includes(s.status) ? "" : " badge-hatch") }, s.status) },
        { label: "Period ends", render: (s) => (s.cancel_at_period_end ? el("span", {}, fmtDate(s.current_period_end), " ", el("span", { class: "badge badge-pending" }, "cancels")) : fmtDate(s.current_period_end)) },
        { label: "Stripe subscription", render: (s) => el("code", { class: "muted" }, s.stripe_subscription_id) },
        { label: "Updated", render: (s) => timeEl(s.updated_at) },
      ],
      empty: ["card", "No subscriptions", "Stripe subscriptions show up here once customers check out."],
    });
  }

  async function queue(into) {
    fill(into, el("div", { class: "card" }, el("div", { class: "empty" }, icon("refresh", "spin"))));
    try {
      const q = await api.get(`${A}/billing/queue`);
      fill(
        into,
        el(
          "div",
          { class: "grid g3" },
          statTile({ label: "Pending pushes", value: q.count, sub: q.stripe_enabled ? "waiting to be sent to Stripe" : "Stripe isn't configured; nothing is sent", index: 0 }),
          statTile({ label: "Pending bandwidth", value: q.pending_bandwidth_bytes, format: fmtBytes, sub: "metered, not yet reported", index: 1 }),
          statTile({ label: "Oldest pending", value: q.oldest ? 1 : 0, format: () => (q.oldest ? fmtDateTime(q.oldest) : "none"), sub: q.oldest ? "should be minutes old, not days" : "the queue is empty", index: 2 }),
        ),
        card("Metering queue", {
          sub: "Up to 200 oldest unreported deltas",
          pad: false,
          body: q.pending.length
            ? dataTable(
                [
                  { label: "Organization", render: (u) => link(`#/orgs/${encodeURIComponent(u.org_id)}`, u.org_id, "mono") },
                  { label: "Metric", render: (u) => el("span", { class: "badge" }, u.metric) },
                  { label: "Quantity", num: true, render: (u) => (u.metric === "bandwidth_bytes" ? fmtBytes(u.quantity) : fmtNum(u.quantity)) },
                  { label: "Window", render: (u) => el("span", { class: "muted" }, `${fmtDateTime(u.window_start)} → ${fmtDateTime(u.window_end)}`) },
                  { label: "Queued", render: (u) => timeEl(u.created_at) },
                ],
                q.pending,
              )
            : emptyState("check", "Queue is empty", "Everything metered has been reported."),
        }),
      );
    } catch (err) {
      fill(into, el("div", { class: "card" }, errorState(err, () => queue(into))));
    }
  }

  async function plans(into) {
    fill(into, el("div", { class: "card" }, el("div", { class: "empty" }, icon("refresh", "spin"))));
    try {
      const { plans: unsorted } = await api.get(`${A}/plans`);
      const rank = ["free", "pro", "team", "payg"];
      const catalog = [...unsorted].sort((a, b) => (rank.indexOf(a.code) + 1 || 99) - (rank.indexOf(b.code) + 1 || 99));
      const feat = (on, label) => el("li", { class: on ? "" : "off" }, icon(on ? "check" : "x"), label);
      const grant = async () => {
        const out = await formDialog({
          title: "Grant a plan by email",
          intro: "Sets the plan on the account's first organization, with an expiry. Use an organization's page to change any other organization.",
          fields: [
            { name: "email", label: "Account email", type: "email", required: true },
            { name: "plan", label: "Plan", type: "select", value: "pro", options: [{ value: "pro", label: "Pro" }, { value: "team", label: "Team" }, { value: "free", label: "Free (revoke)" }] },
            { name: "months", label: "Months", type: "number", value: "1", min: 1, max: 60 },
          ],
          submitLabel: "Grant plan",
          onSubmit: (v) => api.post(`${A}/grant`, { email: v.email, plan: v.plan, months: Number(v.months) }),
        });
        if (out) toast(`Granted ${out.plan}${out.plan_expires_at ? ` until ${fmtDate(out.plan_expires_at)}` : ""}`);
      };
      fill(
        into,
        el("div", { class: "alert" }, icon("alert"), el("div", {}, "Plan limits are defined in code and shown here read-only. Changing the catalog needs a release.")),
        el("div", { class: "actions" }, el("button", { class: "btn btn-primary", type: "button", onClick: grant }, icon("zap"), "Grant a plan by email")),
        el(
          "div",
          { class: "grid g4" },
          catalog.map((p, i) =>
            el(
              "div",
              { class: "card plan-card rise", style: { "--i": i } },
              el("div", {}, el("h3", {}, p.name), el("div", { class: "muted" }, el("code", {}, p.code))),
              el("div", { class: "price" }, p.price_monthly_cents ? `$${(p.price_monthly_cents / 100).toFixed(0)}` : p.code === "payg" ? "Metered" : "$0", p.price_monthly_cents ? el("span", { class: "muted", style: { fontSize: "13px", fontWeight: 400 } }, " /mo") : null),
              el(
                "ul",
                {},
                el("li", {}, icon("radio"), p.max_concurrent_tunnels ? `${p.max_concurrent_tunnels} concurrent tunnels` : "Unlimited concurrent tunnels"),
                el("li", {}, icon("zap"), p.max_bandwidth_bytes_mo ? `${fmtBytes(p.max_bandwidth_bytes_mo, 0)} bandwidth / month` : "Unlimited bandwidth"),
                el("li", {}, icon("scroll"), p.max_requests_mo ? `${fmtNum(p.max_requests_mo)} requests / month` : "Unlimited requests"),
                el("li", {}, icon("link"), `${p.max_reserved_subdomains} reserved subdomains`),
                feat(p.allow_custom_domains, p.allow_custom_domains ? `${p.max_custom_domains} custom domains` : "Custom domains"),
                feat(p.allow_tcp, "TCP tunnels"),
                feat(p.allow_tls, "TLS tunnels"),
                feat(p.allow_udp, "UDP tunnels"),
                el("li", {}, icon("clock"), p.rate_limit_rps ? `${fmtNum(p.rate_limit_rps)} req/s rate limit` : "No rate limit"),
              ),
            ),
          ),
        ),
      );
    } catch (err) {
      fill(into, el("div", { class: "card" }, errorState(err, () => plans(into))));
    }
  }

  function show(tab, initial = false) {
    current = tab;
    list?.destroy();
    list = null;
    if (!initial) history.replaceState(null, "", `#/billing${tab === "subscriptions" ? "" : "?tab=" + tab}`);
    if (tab === "subscriptions") {
      list = subscriptions();
      fill(slot, list.node);
    } else if (tab === "queue") queue(slot);
    else plans(slot);
  }

  host.append(
    tabs({ items: [{ value: "subscriptions", label: "Subscriptions", icon: "card" }, { value: "queue", label: "Metering queue", icon: "zap" }, { value: "plans", label: "Plans & grants", icon: "shield" }], value: current, onChange: show }),
    slot,
  );
  show(current, true);
  return () => list?.destroy();
}

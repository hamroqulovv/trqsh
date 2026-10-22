import { el, icon, fill, fmtNum, fmtBytes, fmtDateTime, fmtDate, timeEl, toast, confirmDialog, formDialog } from "../dom.js";
import { api, A } from "../api.js";
import { card, kv, planBadge, suspendedBadge, activeBadge, pendingBadge, offBadge, roleBadge, copyChip, errorState, dataTable, limitRow, ccBadge, dot, avatar } from "../kit.js";
import { trafficChart } from "../charts.js";
import { auditEntry } from "./audit.js";

const PLAN_OPTIONS = [
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "team", label: "Team" },
  { value: "payg", label: "Pay-as-you-go" },
];

export default async function mount(host, { params, setCrumbs }) {
  const id = params[0];
  const enc = encodeURIComponent(id);
  const body = el("div", { class: "stack" });
  host.append(body);
  const charts = [];

  async function act(fn, ok) {
    try {
      await fn();
      if (ok) toast(ok);
      await load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function load() {
    let d;
    try {
      d = await api.get(`${A}/orgs/${enc}`);
    } catch (err) {
      setCrumbs([{ label: "Organizations", href: "#/orgs" }, { label: "Not found" }]);
      fill(body, el("div", { class: "card" }, errorState(err, err.status === 404 ? null : load)));
      return;
    }
    charts.splice(0).forEach((c) => c.destroy?.());
    const o = d.org;
    setCrumbs([{ label: "Organizations", href: "#/orgs" }, { label: o.name }]);
    const suspended = !!o.suspended_at;
    const lim = d.limits;
    const owners = d.members.filter((m) => m.role === "owner");

    // ----- actions -----
    const rename = async () => {
      const out = await formDialog({
        title: "Rename organization",
        fields: [{ name: "name", label: "Name", value: o.name, required: true }],
        onSubmit: (v) => api.patch(`${A}/orgs/${enc}`, { name: v.name }),
      });
      if (out) (toast("Organization renamed"), load());
    };
    const changePlan = async () => {
      const out = await formDialog({
        title: "Change plan",
        intro: o.live_subscription ? "This organization has a live Stripe subscription. The next billing webhook will overwrite a manual change." : "Applies immediately to limits and edge entitlements.",
        fields: [
          { name: "plan", label: "Plan", type: "select", value: o.plan, options: PLAN_OPTIONS },
          { name: "months", label: "Duration in months", type: "number", value: o.plan_expires_at ? "1" : "0", min: 0, max: 120, hint: "0 means it never expires. Free always clears the expiry." },
        ],
        submitLabel: "Apply plan",
        onSubmit: (v) => api.post(`${A}/orgs/${enc}/plan`, { plan: v.plan, months: Number(v.months) || 0 }),
      });
      if (out) (toast("Plan updated"), load());
    };
    const suspend = async () => {
      const out = await formDialog({
        title: `Suspend ${o.name}?`,
        intro: "Every API key of this organization stops authenticating immediately: tunnels can't be bound and the REST API refuses its keys. Members can still sign in to the dashboard.",
        fields: [{ name: "reason", label: "Reason (shown to staff only)", type: "textarea", placeholder: "e.g. phishing report, chargeback" }],
        submitLabel: "Suspend organization",
        danger: true,
        onSubmit: (v) => api.post(`${A}/orgs/${enc}/suspend`, { reason: v.reason }),
      });
      if (out) (toast("Organization suspended"), load());
    };
    const unsuspend = async () => {
      if (await confirmDialog({ title: "Reinstate organization?", message: `API keys of ${o.name} will authenticate again.`, confirmLabel: "Reinstate" }))
        act(() => api.post(`${A}/orgs/${enc}/unsuspend`), "Organization reinstated");
    };
    const remove = async () => {
      const ok = await confirmDialog({
        title: "Delete organization permanently?",
        message: `This deletes ${o.name} with its ${d.counts.api_keys} API key(s), ${d.counts.domains} domain(s), ${d.counts.subdomains} subdomain(s), usage and tunnel history. It can't be undone.${o.live_subscription ? " It has a live subscription, so the server will refuse until that is cancelled in Stripe." : ""}`,
        confirmLabel: "Delete organization",
        danger: true,
        typed: o.name,
      });
      if (!ok) return;
      try {
        await api.del(`${A}/orgs/${enc}`, { confirm: o.name });
        toast("Organization deleted");
        location.hash = "#/orgs";
      } catch (e) {
        toast(e.message, "error");
      }
    };

    // ----- header -----
    const head = el(
      "div",
      { class: "page-head" },
      el("div", {}, el("h1", {}, o.name), el("div", { class: "chips" }, planBadge(o.plan, o.plan_expires_at), suspended ? suspendedBadge("Suspended", o.suspended_reason) : activeBadge(), o.live_subscription ? el("span", { class: "badge" }, icon("card"), "Stripe subscription") : null)),
      el(
        "div",
        { class: "actions" },
        el("button", { class: "btn btn-outline", type: "button", onClick: changePlan }, icon("zap"), "Change plan"),
        el("button", { class: "btn btn-outline", type: "button", onClick: rename }, icon("pencil"), "Rename"),
        suspended ? el("button", { class: "btn btn-outline", type: "button", onClick: unsuspend }, icon("check"), "Reinstate") : el("button", { class: "btn btn-outline", type: "button", onClick: suspend }, icon("ban"), "Suspend"),
        el("button", { class: "btn btn-danger", type: "button", onClick: remove }, icon("trash"), "Delete"),
      ),
    );
    const banner = suspended ? el("div", { class: "alert alert-hatch" }, icon("ban"), el("div", {}, el("strong", {}, "This organization is suspended."), ` Since ${fmtDateTime(o.suspended_at)}${o.suspended_reason ? ` — ${o.suspended_reason}` : ""}. Its API keys no longer authenticate.`)) : null;

    // ----- limits -----
    const usage = d.usage;
    const limits = card("Plan & usage", {
      sub: `Last 30 days against the ${lim.name || o.plan} plan`,
      body: el(
        "div",
        {},
        limitRow("Bandwidth", (usage.bytes_in || 0) + (usage.bytes_out || 0), lim.max_bandwidth_bytes_mo, fmtBytes),
        limitRow("Requests", usage.requests || 0, lim.max_requests_mo),
        limitRow("Live tunnels", d.tunnels.active, lim.max_concurrent_tunnels),
        limitRow("Reserved subdomains", d.counts.subdomains, lim.max_reserved_subdomains),
        limitRow("Custom domains", d.counts.domains, lim.allow_custom_domains ? lim.max_custom_domains : 0),
        el("div", { class: "chips", style: { marginTop: "10px" } }, ...[["TCP", lim.allow_tcp], ["TLS", lim.allow_tls], ["UDP", lim.allow_udp], ["Custom domains", lim.allow_custom_domains]].map(([n, on]) => (on ? el("span", { class: "badge" }, dot(""), n) : offBadge(n)))),
      ),
    });

    const points = (d.usage_series || []).map((p) => ({ t: new Date(p.start), a: p.bytes_in, b: p.bytes_out, c: p.requests }));
    const chart = trafficChart(points, { height: 200 });
    charts.push(chart);
    const traffic = card("Traffic", { sub: `${fmtBytes(usage.bytes_in)} in · ${fmtBytes(usage.bytes_out)} out · ${fmtNum(usage.requests)} requests`, body: chart });

    // ----- identity -----
    const identity = card("Details", {
      body: kv([
        ["Org ID", copyChip(o.id)],
        ["Plan", el("span", {}, planBadge(o.plan), o.stored_plan !== o.plan ? el("span", { class: "muted" }, ` (stored: ${o.stored_plan}, expired)`) : null)],
        ["Plan expires", o.plan_expires_at ? fmtDateTime(o.plan_expires_at) : el("span", { class: "muted" }, "never")],
        ["Stripe customer", o.stripe_customer ? copyChip(o.stripe_customer) : null],
        ["Created", el("span", {}, fmtDateTime(o.created_at), " ", el("span", { class: "muted" }, "(", timeEl(o.created_at), ")"))],
      ]),
    });

    // ----- members -----
    const addMember = async () => {
      const out = await formDialog({
        title: "Add member",
        intro: "The person must already have an account.",
        fields: [
          { name: "email", label: "Account email", type: "email", required: true, placeholder: "name@example.com" },
          { name: "role", label: "Role", type: "select", value: "member", options: [{ value: "member", label: "Member" }, { value: "admin", label: "Admin" }, { value: "owner", label: "Owner" }] },
        ],
        submitLabel: "Add member",
        onSubmit: (v) => api.post(`${A}/orgs/${enc}/members`, v),
      });
      if (out) (toast("Member added"), load());
    };
    const setRole = async (m) => {
      const out = await formDialog({
        title: `Role for ${m.email || m.user_id}`,
        fields: [{ name: "role", label: "Role", type: "select", value: m.role, options: [{ value: "member", label: "Member" }, { value: "admin", label: "Admin" }, { value: "owner", label: "Owner" }] }],
        onSubmit: (v) => api.patch(`${A}/orgs/${enc}/members/${encodeURIComponent(m.user_id)}`, v),
      });
      if (out) (toast("Role updated"), load());
    };
    const removeMember = async (m) => {
      if (await confirmDialog({ title: "Remove member?", message: `${m.email || m.user_id} will lose access to ${o.name}. Their account is not deleted.`, confirmLabel: "Remove", danger: true }))
        act(() => api.del(`${A}/orgs/${enc}/members/${encodeURIComponent(m.user_id)}`), "Member removed");
    };
    const members = card("Members", {
      sub: `${d.members.length} · ${owners.length} owner${owners.length === 1 ? "" : "s"}`,
      actions: [el("button", { class: "btn btn-outline btn-sm", type: "button", onClick: addMember }, icon("plus"), "Add")],
      pad: false,
      body: dataTable(
        [
          { label: "Member", render: (m) => el("div", { class: "cell-main" }, avatar(m.name || m.email), el("div", { class: "cell-text" }, el("a", { href: `#/users/${encodeURIComponent(m.user_id)}`, class: "cell-title" }, m.name || m.email || m.user_id), el("span", { class: "cell-sub" }, m.email || ""))) },
          { label: "Role", render: (m) => roleBadge(m.role) },
          { label: "Status", render: (m) => (m.disabled_at ? suspendedBadge() : activeBadge()) },
          {
            label: "",
            render: (m) => el("div", { class: "cell-actions" }, el("button", { class: "btn btn-ghost btn-sm", type: "button", onClick: () => setRole(m) }, "Role"), el("button", { class: "btn btn-ghost btn-sm btn-icon", type: "button", "aria-label": "Remove member", onClick: () => removeMember(m) }, icon("trash"))),
          },
        ],
        d.members,
      ),
    });

    // ----- keys -----
    const revokeKey = async (k) => {
      if (await confirmDialog({ title: "Revoke API key?", message: `“${k.name || k.prefix}” stops working immediately. Agents using it will be rejected.`, confirmLabel: "Revoke key", danger: true }))
        act(() => api.del(`${A}/api-keys/${encodeURIComponent(k.id)}`), "Key revoked");
    };
    const keys = card("API keys", {
      sub: `${d.api_keys.filter((k) => !k.revoked_at).length} active of ${d.api_keys.length}`,
      pad: false,
      body: d.api_keys.length
        ? dataTable(
            [
              { label: "Name", render: (k) => k.name || "—" },
              { label: "Prefix", render: (k) => el("code", {}, k.prefix) },
              { label: "Last used", render: (k) => (k.last_used_at ? timeEl(k.last_used_at) : el("span", { class: "muted" }, "never")) },
              { label: "Status", render: (k) => (k.revoked_at ? offBadge("Revoked") : activeBadge()) },
              { label: "", render: (k) => (k.revoked_at ? null : el("div", { class: "cell-actions" }, el("button", { class: "btn btn-ghost btn-sm", type: "button", onClick: () => revokeKey(k) }, icon("ban"), "Revoke"))) },
            ],
            d.api_keys,
          )
        : el("div", { class: "empty" }, "No API keys."),
    });

    // ----- subdomains & domains -----
    const reserve = async () => {
      const out = await formDialog({
        title: "Reserve a subdomain",
        intro: "Reserves it for this organization. Support grants bypass the plan's reservation cap.",
        fields: [{ name: "subdomain", label: "Subdomain", required: true, placeholder: "acme" }],
        submitLabel: "Reserve",
        onSubmit: (v) => api.post(`${A}/orgs/${enc}/subdomains`, v),
      });
      if (out) (toast("Subdomain reserved"), load());
    };
    const release = async (s) => {
      if (await confirmDialog({ title: "Release subdomain?", message: `${s.subdomain} becomes available to anyone.`, confirmLabel: "Release", danger: true })) act(() => api.del(`${A}/subdomains/${encodeURIComponent(s.id)}`), "Subdomain released");
    };
    const subs = card("Reserved subdomains", {
      sub: `${d.subdomains.length} of ${lim.max_reserved_subdomains} on this plan`,
      actions: [el("button", { class: "btn btn-outline btn-sm", type: "button", onClick: reserve }, icon("plus"), "Reserve")],
      pad: false,
      body: d.subdomains.length
        ? dataTable([{ label: "Subdomain", render: (s) => el("code", {}, s.subdomain) }, { label: "Reserved", render: (s) => timeEl(s.created_at) }, { label: "", render: (s) => el("div", { class: "cell-actions" }, el("button", { class: "btn btn-ghost btn-sm", type: "button", onClick: () => release(s) }, "Release")) }], d.subdomains)
        : el("div", { class: "empty" }, "None reserved."),
    });
    const verify = async (x) => {
      if (await confirmDialog({ title: "Mark domain verified?", message: `${x.domain} is marked verified without a DNS check. Only do this if ownership was proven another way.`, confirmLabel: "Mark verified" })) act(() => api.post(`${A}/domains/${encodeURIComponent(x.id)}/verify`), "Domain verified");
    };
    const dropDomain = async (x) => {
      if (await confirmDialog({ title: "Delete domain?", message: `${x.domain} stops routing to this organization's tunnels.`, confirmLabel: "Delete domain", danger: true })) act(() => api.del(`${A}/domains/${encodeURIComponent(x.id)}`), "Domain deleted");
    };
    const domains = card("Custom domains", {
      sub: `${d.domains.length} added`,
      pad: false,
      body: d.domains.length
        ? dataTable(
            [
              { label: "Domain", render: (x) => el("code", {}, x.domain) },
              { label: "Status", render: (x) => (x.verified_at ? activeBadge("Verified") : pendingBadge("Pending DNS")) },
              { label: "TXT token", render: (x) => (x.verified_at ? null : copyChip(x.verify_token, "copy token")) },
              { label: "", render: (x) => el("div", { class: "cell-actions" }, x.verified_at ? null : el("button", { class: "btn btn-ghost btn-sm", type: "button", onClick: () => verify(x) }, icon("check"), "Verify"), el("button", { class: "btn btn-ghost btn-sm btn-icon", type: "button", "aria-label": "Delete domain", onClick: () => dropDomain(x) }, icon("trash"))) },
            ],
            d.domains,
          )
        : el("div", { class: "empty" }, "No custom domains."),
    });

    // ----- tunnels -----
    const tunnels = card("Recent tunnels", {
      sub: `${d.tunnels.active} live · ${fmtNum(d.tunnels.total)} all-time`,
      actions: [el("a", { class: "btn btn-outline btn-sm", href: `#/tunnels?q=${enc}` }, "All tunnels", icon("arrowRight"))],
      pad: false,
      body: d.tunnels.recent.length
        ? dataTable(
            [
              { label: "Public URL", render: (t) => el("span", { class: "mono cell-title" }, (t.public_url || "—").replace(/^https?:\/\//, "")) },
              { label: "Type", render: (t) => el("span", { class: "badge" }, t.type) },
              { label: "From", render: (t) => ccBadge(t.country) },
              { label: "Traffic", num: true, render: (t) => fmtBytes(t.bytes_in + t.bytes_out) },
              { label: "Started", render: (t) => timeEl(t.started_at) },
              { label: "Status", render: (t) => (t.status === "active" ? el("span", { class: "badge" }, dot("", true), "Live") : offBadge("Closed")) },
            ],
            d.tunnels.recent,
          )
        : el("div", { class: "empty" }, "No tunnels yet."),
    });

    // ----- billing -----
    let billing = null;
    if (d.subscription) {
      const s = d.subscription;
      billing = card("Subscription", {
        sub: "Mirrored from Stripe",
        body: kv([
          ["Status", el("span", { class: "badge" + (s.status === "active" || s.status === "trialing" ? "" : " badge-hatch") }, s.status)],
          ["Plan", planBadge(s.plan)],
          ["Renews / ends", fmtDate(s.current_period_end)],
          ["Cancels at period end", s.cancel_at_period_end ? "Yes" : "No"],
          ["Stripe subscription", copyChip(s.stripe_subscription_id)],
        ]),
      });
    }

    const activity = card("Admin history", { sub: "Changes made to this organization from the console", body: d.audit.length ? el("ol", { class: "timeline" }, d.audit.map((e) => auditEntry(e))) : el("div", { class: "muted" }, "Nothing yet.") });

    fill(
      body,
      head,
      banner,
      el("div", { class: "grid g-7-5" }, traffic, limits),
      el("div", { class: "grid g-7-5" }, members, el("div", { class: "stack" }, identity, billing)),
      keys,
      el("div", { class: "grid g2" }, subs, domains),
      tunnels,
      activity,
    );
  }

  await load();
  return () => charts.forEach((c) => c.destroy?.());
}

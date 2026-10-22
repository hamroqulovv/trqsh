import { el, icon, clear, fill, fmtNum, fmtBytes, fmtCompact, timeEl, relTime } from "../dom.js";
import { api, A } from "../api.js";
import { statTile, card, segmented, errorState, emptyState, dataTable, ccBadge, dot, link } from "../kit.js";
import { trafficChart, sparkline, hbars } from "../charts.js";
import { auditEntry } from "./audit.js";

const RANGES = [
  { value: "1", label: "24h" },
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
];

export default async function mount(host) {
  let days = "30";
  let timer = null;
  let live = false;
  let disposed = false;
  let chartNode = null;

  const lede = el("p", { class: "lede" }, "Fleet health at a glance.");
  const asOf = el("span", { class: "muted tabular" });
  const liveBtn = el("button", { class: "btn btn-outline btn-sm", type: "button", "aria-pressed": "false" }, dot("off"), "Live");
  const refreshBtn = el("button", { class: "btn btn-outline btn-sm", type: "button" }, icon("refresh"), "Refresh");
  const body = el("div", { class: "stack" });

  host.append(
    el("div", { class: "page-head" }, el("div", {}, el("h1", {}, "Overview"), lede), el("div", { class: "actions" }, asOf, liveBtn, refreshBtn)),
    body,
  );

  const chartHost = el("div");
  const rangeSeg = segmented({ options: RANGES, value: days, label: "Traffic range", onChange: (v) => ((days = v), loadChart()) });

  async function loadChart() {
    try {
      const u = await api.get(`${A}/usage`, { days });
      if (disposed) return;
      chartNode?.destroy?.();
      const points = u.series.map((p) => ({ t: new Date(p.start), a: p.bytes_in, b: p.bytes_out, c: p.requests }));
      chartNode = trafficChart(points, { bucket: u.bucket });
      fill(
        chartHost,
        chartNode,
        points.length ? el("div", { class: "legend", style: { marginTop: "10px" } }, el("span", {}, el("i"), "Inbound"), el("span", {}, el("i", { class: "dashed" }), "Outbound")) : null,
      );
      renderTop(u.top_orgs);
    } catch (err) {
      clear(chartHost).append(errorState(err, loadChart));
    }
  }

  const topHost = el("div");
  function renderTop(rows) {
    clear(topHost).append(
      rows.length
        ? hbars(
            rows.map((o) => ({ label: link(`#/orgs/${encodeURIComponent(o.org_id)}`, o.org_name || o.org_id), value: o.bytes_in + o.bytes_out, display: fmtBytes(o.bytes_in + o.bytes_out) })),
          )
        : el("div", { class: "muted" }, "No traffic in this window."),
    );
  }

  async function load() {
    try {
      const [stats, usage30, tunnels, audit] = await Promise.all([
        api.get(`${A}/stats`),
        api.get(`${A}/usage`, { days: 14 }),
        api.get(`${A}/tunnels`, { active: "true", limit: 8 }),
        api.get(`${A}/audit`, { limit: 6 }),
      ]);
      if (disposed) return;
      const s = stats.stats;
      const traffic = (s.bytes_in_30d || 0) + (s.bytes_out_30d || 0);
      const spark = sparkline(usage30.series.map((p) => p.bytes_in + p.bytes_out));
      const plans = s.orgs_by_plan || {};
      const planOrder = ["free", "pro", "team", "payg", ...Object.keys(plans).filter((p) => !["free", "pro", "team", "payg"].includes(p))].filter((p) => plans[p]);

      const tiles = el(
        "div",
        { class: "grid g4" },
        statTile({ label: "Users", value: s.users, sub: `+${fmtNum(s.new_users_7d)} this week · +${fmtNum(s.new_users_30d)} in 30d`, href: "#/users", index: 0 }),
        statTile({ label: "Organizations", value: s.orgs, sub: planOrder.map((p) => `${fmtNum(plans[p])} ${p}`).join(" · ") || "—", href: "#/orgs", index: 1 }),
        statTile({ label: "Active tunnels", value: s.active_tunnels, live: s.active_tunnels > 0, sub: `${fmtNum(s.total_tunnels)} sessions all-time`, href: "#/tunnels", index: 2 }),
        statTile({ label: "Traffic · 30 days", value: traffic, format: fmtBytes, sub: `${fmtBytes(s.bytes_in_30d)} in · ${fmtBytes(s.bytes_out_30d)} out`, spark, index: 3 }),
        statTile({ label: "Requests · 30 days", value: s.requests_30d, format: fmtCompact, sub: `${fmtNum(s.requests_30d)} total`, index: 4 }),
        statTile({ label: "API keys", value: s.api_keys, href: "#/keys", sub: "issued, incl. revoked", index: 5 }),
        statTile({ label: "Custom domains", value: s.custom_domains, href: "#/domains", sub: "across all orgs", index: 6 }),
        statTile({ label: "Reserved subdomains", value: s.reserved_subdomains, href: "#/domains", sub: "across all orgs", index: 7 }),
      );

      const trafficCard = card("Traffic", { sub: "Bytes metered at the edge", actions: [rangeSeg], body: chartHost });

      const planCard = card("Plan mix", {
        sub: "Organizations by effective plan",
        body: hbars(planOrder.map((p) => ({ label: p, value: plans[p], display: fmtNum(plans[p]) })), { empty: "No organizations yet." }),
      });

      const liveRows = tunnels.sessions;
      const liveCard = card("Live tunnels", {
        sub: `${fmtNum(tunnels.total)} connected right now`,
        actions: [el("a", { class: "btn btn-outline btn-sm", href: "#/tunnels" }, "View all", icon("arrowRight"))],
        pad: false,
        body: liveRows.length
          ? dataTable(
              [
                { label: "Public URL", render: (t) => el("span", { class: "mono cell-title" }, (t.public_url || "—").replace(/^https?:\/\//, "")) },
                { label: "Type", render: (t) => el("span", { class: "badge" }, t.type) },
                { label: "Region", render: (t) => t.region || null },
                { label: "From", render: (t) => el("span", { class: "cell-main" }, ccBadge(t.country), t.city ? el("span", { class: "muted" }, t.city) : null) },
                { label: "Started", render: (t) => timeEl(t.started_at) },
              ],
              liveRows,
              { href: (t) => `#/orgs/${encodeURIComponent(t.org_id)}` },
            )
          : emptyState("radio", "No live tunnels", "Nobody is connected right now."),
      });

      const geo = Object.entries(stats.geo || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const geoCard = card("Tunnels by country", {
        sub: "All sessions, by where the agent connected from",
        body: hbars(geo.map(([cc, n]) => ({ label: el("span", { class: "cell-main" }, ccBadge(cc), cc === "??" ? "Unknown" : ""), value: n, display: fmtNum(n) })), { empty: "No tunnel sessions yet." }),
      });

      const topCard = card("Top organizations", { sub: "By traffic in the selected range", body: topHost });

      const audits = audit.entries;
      const activityCard = card("Recent admin activity", {
        actions: [el("a", { class: "btn btn-outline btn-sm", href: "#/audit" }, "Audit log", icon("arrowRight"))],
        body: audits.length ? el("ol", { class: "timeline" }, audits.map((e) => auditEntry(e))) : el("div", { class: "muted" }, "No admin changes recorded yet."),
      });

      const regions = stats.regions || [];
      const regionCard = card("Edge regions", {
        sub: `${regions.length} configured`,
        pad: false,
        body: regions.length
          ? dataTable(
              [
                { label: "Code", render: (r) => el("code", {}, r.code) },
                { label: "Name", render: (r) => el("span", { class: "cell-main" }, ccBadge(r.country), r.name) },
                { label: "Endpoint", render: (r) => el("code", { class: "muted" }, r.endpoint) },
                { label: "Default", render: (r) => (r.default ? el("span", { class: "badge badge-solid" }, "default") : null) },
              ],
              regions,
            )
          : emptyState("globe", "No regions configured"),
      });

      clear(body).append(
        tiles,
        el("div", { class: "grid g-7-5" }, trafficCard, planCard),
        el("div", { class: "grid g-7-5" }, liveCard, geoCard),
        el("div", { class: "grid g2" }, topCard, activityCard),
        regionCard,
      );
      asOf.textContent = `Updated ${relTime(stats.generated_at)}`;
      loadChart();
    } catch (err) {
      clear(body).append(el("div", { class: "card" }, errorState(err, load)));
    }
  }

  refreshBtn.addEventListener("click", load);
  liveBtn.addEventListener("click", () => {
    live = !live;
    liveBtn.setAttribute("aria-pressed", String(live));
    liveBtn.firstChild.replaceWith(dot(live ? "" : "off", live));
    clearInterval(timer);
    if (live) timer = setInterval(() => !document.hidden && load(), 10000);
  });

  await load();
  return () => {
    disposed = true;
    clearInterval(timer);
    chartNode?.destroy?.();
  };
}

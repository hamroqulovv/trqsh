import { el, icon, fill, fmtNum, fmtBytes, fmtDateTime, copyText, toast } from "../dom.js";
import { api, A } from "../api.js";
import { card, kv, dot, errorState, dataTable, ccBadge, offBadge, activeBadge } from "../kit.js";

function uptime(s) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

const feature = (on, label, detail) => el("span", { class: "badge" + (on ? "" : " badge-off") }, dot(on ? "" : "off"), label, detail ? el("span", { class: "muted" }, ` · ${detail}`) : null);

export default async function mount(host) {
  const body = el("div", { class: "stack" });
  host.append(body);
  let snapshot = null;
  const copyDiag = () => snapshot && copyText(JSON.stringify(snapshot, null, 2), "Diagnostics copied");

  async function load() {
    try {
      const s = await api.get(`${A}/system`);
      snapshot = s;
      const c = s.config;
      fill(
        body,
        el(
          "div",
          { class: "page-head" },
          el("div", {}, el("h1", {}, "System"), el("p", { class: "lede" }, "What this API process is running and which features are configured. Secrets are never shown.")),
          el("div", { class: "actions" }, el("button", { class: "btn btn-outline", type: "button", onClick: load }, icon("refresh"), "Refresh"), el("button", { class: "btn btn-outline", type: "button", onClick: copyDiag }, icon("copy"), "Copy diagnostics")),
        ),
        c.production ? null : el("div", { class: "alert alert-hatch" }, icon("alert"), el("div", {}, el("strong", {}, "Development mode."), " This is not a production profile: the in-memory store loses data on restart and dev sign-in may be enabled.")),
        el(
          "div",
          { class: "grid g2" },
          card("Runtime", {
            body: kv([
              ["Service", `${s.service} ${s.version}`],
              ["Go", `${s.go_version} · ${s.os}/${s.arch}`],
              ["Started", fmtDateTime(s.started_at)],
              ["Uptime", uptime(s.uptime_seconds)],
              ["CPUs / goroutines", `${s.cpus} / ${fmtNum(s.goroutines)}`],
              ["Heap in use", fmtBytes(s.memory.alloc)],
              ["Memory from OS", fmtBytes(s.memory.sys)],
              ["GC cycles", fmtNum(s.memory.gc_runs)],
            ]),
          }),
          card("Configuration", {
            body: kv([
              ["Environment", el("span", { class: "badge" + (c.production ? " badge-solid" : "") }, c.env)],
              ["Base domain", el("code", {}, c.base_domain)],
              ["API URL", el("code", {}, c.public_url)],
              ["Dashboard URL", c.app_url ? el("code", {}, c.app_url) : null],
              ["Pairing URL", c.qr_url ? el("code", {}, c.qr_url) : null],
              ["Data store", c.store === "postgres" ? `Postgres · up to ${c.db_max_open_conns} connections` : "In-memory (not persistent)"],
              ["Ops / metrics", c.metrics_addr ? el("code", {}, c.metrics_addr) : "off"],
            ]),
          }),
        ),
        card("Features", {
          body: el(
            "div",
            { class: "chips" },
            feature(c.store === "postgres", "Postgres", c.store === "postgres" ? "" : "using memory"),
            feature(c.redis, "Redis", c.redis ? "shared limits & sessions" : "per-process"),
            feature(c.trust_proxy, "Trust proxy headers"),
            feature(!c.dev_auth, "Password-less sign-in disabled", c.dev_auth ? "ENABLED" : ""),
            ...["github", "google"].map((p) => feature(c.oauth_providers.includes(p), p)),
            feature(s.billing.stripe_enabled, "Stripe", s.billing.stripe_enabled ? (s.billing.webhook_secret_set ? "webhooks signed" : "webhook secret missing") : "off"),
            feature(!!s.geo.header || s.geo.lookup_api_set, "GeoIP", s.geo.header || (s.geo.lookup_api_set ? "lookup API" : "")),
          ),
        }),
        el(
          "div",
          { class: "grid g2" },
          card("Billing", {
            body: kv([
              ["Stripe", s.billing.stripe_enabled ? activeBadge("Configured") : offBadge("Not configured")],
              ["Metering interval", s.billing.metering_interval === "0s" ? "off" : s.billing.metering_interval],
              ["Trial", `${s.billing.trial_days} days`],
              ["Dunning grace", s.billing.dunning_grace],
            ]),
          }),
          card("Admin console", {
            body: kv([
              ["Operator", el("code", {}, s.admin.user)],
              ["Session length", `${s.admin.session_hours} hours`],
              ["Audit log", el("a", { href: "#/audit" }, "Open audit log")],
            ]),
          }),
        ),
        card("Edge regions", {
          pad: false,
          body: s.geo.regions?.length
            ? dataTable(
                [
                  { label: "Code", render: (r) => el("code", {}, r.code) },
                  { label: "Name", render: (r) => el("span", { class: "cell-main" }, ccBadge(r.country), r.name) },
                  { label: "Continent", render: (r) => r.continent },
                  { label: "Endpoint", render: (r) => el("code", { class: "muted" }, r.endpoint) },
                  { label: "Default", render: (r) => (r.default ? el("span", { class: "badge badge-solid" }, "default") : null) },
                ],
                s.geo.regions,
              )
            : el("div", { class: "empty" }, "No regions configured."),
        }),
      );
    } catch (err) {
      fill(body, el("div", { class: "card" }, errorState(err, load)));
    }
  }
  await load();
}

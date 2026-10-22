// Reusable view pieces: badges, stat tiles, tables, pagers, tabs, key/value lists
// and the server-paged list that most pages are built from.
import { el, icon, clear, fmtNum, fmtDate, copyText, debounce, initials, reduceMotion } from "./dom.js";
import { api } from "./api.js";

// ---------- badges ----------

export const dot = (state, live = false) => el("span", { class: "dot", dataset: state ? { state } : {}, ...(live ? { "data-live": "" } : {}) });

export function planBadge(plan, expires) {
  const solid = plan && plan !== "free";
  const exp = expires && new Date(expires) > new Date() ? ` · until ${fmtDate(expires)}` : "";
  return el("span", { class: "badge" + (solid ? " badge-solid" : ""), title: exp ? `Expires ${fmtDate(expires)}` : "" }, plan || "free", exp);
}

export const suspendedBadge = (label = "Suspended", title = "") => el("span", { class: "badge badge-hatch", title }, icon("ban"), label);
export const activeBadge = (label = "Active") => el("span", { class: "badge" }, dot("", false), label);
export const pendingBadge = (label = "Pending") => el("span", { class: "badge badge-pending" }, dot("pending"), label);
export const offBadge = (label) => el("span", { class: "badge badge-off" }, dot("off"), label);
export const roleBadge = (role) => el("span", { class: "badge" + (role === "owner" ? " badge-solid" : "") }, role);
export const ccBadge = (cc) => (cc && cc !== "??" ? el("span", { class: "cc", title: cc }, cc) : el("span", { class: "muted" }, "—"));

export function avatar(name, large = false) {
  return el("span", { class: "avatar" + (large ? " avatar-lg" : ""), "aria-hidden": "true" }, initials(name));
}

// Monospace value that copies itself on click.
export function copyChip(text, shown) {
  if (!text) return el("span", { class: "muted" }, "—");
  return el("button", { class: "copy", type: "button", title: "Copy", onClick: (e) => (e.stopPropagation(), copyText(text, "Copied to clipboard")) }, shown ?? text, icon("copy"));
}

export const link = (href, text, cls = "") => el("a", { href, class: cls, onClick: (e) => e.stopPropagation() }, text);

// ---------- stat tile ----------

export function statTile({ label, value, sub, live = false, format = fmtNum, spark = null, href = null, index = 0 }) {
  const valueEl = el("div", { class: "stat-value" }, format(value));
  if (typeof value === "number" && !reduceMotion() && value > 0) {
    const t0 = performance.now();
    const dur = 900;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      valueEl.textContent = format(Math.round(value * (1 - Math.pow(1 - p, 4))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  const body = [el("div", { class: "stat-label" }, live ? dot("", true) : null, label), valueEl, sub ? el("div", { class: "stat-sub" }, sub) : null, spark];
  return href ? el("a", { class: "card spotlight stat rise", href, style: { "--i": index } }, body) : el("div", { class: "card spotlight stat rise", style: { "--i": index } }, body);
}

// ---------- states ----------

export function emptyState(iconName, title, sub) {
  return el("div", { class: "empty" }, icon(iconName), el("strong", {}, title), sub ? el("span", {}, sub) : null);
}

export function errorState(err, retry) {
  return el(
    "div",
    { class: "empty" },
    icon("alert"),
    el("strong", {}, "Couldn't load this"),
    el("span", {}, err?.message || "Unexpected error"),
    retry ? el("button", { class: "btn btn-outline btn-sm", type: "button", onClick: retry }, icon("refresh"), "Try again") : null,
  );
}

export function skeletonRows(cols, rows = 6) {
  return Array.from({ length: rows }, (_, r) =>
    el("tr", { class: "row-skel", "aria-hidden": "true" }, Array.from({ length: cols }, (_, c) => el("td", {}, el("div", { class: "skeleton", style: { width: 40 + ((r * 17 + c * 29) % 50) + "%" } })))),
  );
}

// ---------- controls ----------

export function segmented({ options, value, onChange, label }) {
  const root = el("div", { class: "seg", role: "group", "aria-label": label || "Filter", style: { "--seg-n": options.length } });
  const thumb = el("span", { class: "seg-thumb" });
  root.append(thumb);
  const buttons = options.map((o) => {
    const b = el("button", { class: "seg-option", type: "button", "aria-pressed": "false" }, o.label);
    b.addEventListener("click", () => {
      set(o.value);
      onChange(o.value);
    });
    root.append(b);
    return b;
  });
  function set(v) {
    const i = Math.max(0, options.findIndex((o) => o.value === v));
    root.style.setProperty("--seg-i", i);
    buttons.forEach((b, idx) => b.setAttribute("aria-pressed", String(idx === i)));
  }
  set(value);
  root.set = set;
  return root;
}

export function tabs({ items, value, onChange }) {
  const root = el("div", { class: "tabs", role: "tablist" });
  const nodes = items.map((it) => {
    const b = el("button", { class: "tab", role: "tab", type: "button", "aria-selected": "false" }, it.icon ? icon(it.icon) : null, it.label);
    b.addEventListener("click", () => {
      set(it.value);
      onChange(it.value);
    });
    root.append(b);
    return b;
  });
  function set(v) {
    nodes.forEach((n, i) => n.setAttribute("aria-selected", String(items[i].value === v)));
  }
  set(value);
  return root;
}

export function kv(pairs) {
  const dl = el("dl", { class: "kv" });
  for (const [k, v] of pairs) {
    dl.append(el("dt", {}, k), el("dd", {}, v ?? el("span", { class: "muted" }, "—")));
  }
  return dl;
}

export function card(title, { sub, actions, body, pad = true, foot } = {}) {
  return el(
    "section",
    { class: "card" },
    title || actions ? el("div", { class: "card-head" }, el("div", {}, el("h2", {}, title), sub ? el("div", { class: "sub" }, sub) : null), actions ? el("div", { class: "actions" }, actions) : null) : null,
    el("div", { class: pad ? "card-body" : "" }, body),
    foot || null,
  );
}

export function limitRow(label, used, limit, fmt = fmtNum) {
  const unlimited = !limit;
  const pct = unlimited ? 0 : Math.min(100, (used / limit) * 100);
  return el(
    "div",
    { class: "limit-row" },
    el("div", { class: "limit-top" }, el("span", {}, label), el("span", {}, unlimited ? `${fmt(used)} · no cap` : `${fmt(used)} / ${fmt(limit)}`)),
    el("div", { class: "meter", role: "progressbar", "aria-valuenow": Math.round(pct), "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": label }, el("div", { class: "meter-fill", dataset: pct >= 85 ? { tone: "warn" } : {}, style: { width: Math.max(unlimited ? 0 : 1.5, pct) + "%" } })),
  );
}

// ---------- table ----------

// columns: [{ key, label, num?, render(row) }]. Rows with href are keyboard- and
// click-navigable.
export function dataTable(columns, rows, { href = null, onRow = null } = {}) {
  const body = el("tbody");
  for (const row of rows) {
    const target = href?.(row);
    const tr = el("tr", target ? { dataset: { href: target }, tabindex: 0 } : onRow ? { tabindex: 0, style: { cursor: "pointer" } } : {});
    for (const c of columns) {
      const content = c.render ? c.render(row) : row[c.key];
      tr.append(el("td", { class: c.num ? "num" : "" }, content ?? el("span", { class: "muted" }, "—")));
    }
    const go = () => (target ? (location.hash = target) : onRow?.(row));
    tr.addEventListener("click", (e) => {
      if (e.target.closest("a,button,input,select")) return;
      go();
    });
    tr.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target === tr) {
        e.preventDefault();
        go();
      }
    });
    body.append(tr);
  }
  return el("div", { class: "table-wrap" }, el("table", { class: "table" }, el("thead", {}, el("tr", {}, columns.map((c) => el("th", { class: c.num ? "num" : "", scope: "col" }, c.label)))), body));
}

export function pager({ offset, limit, total, count, onPage }) {
  const from = count ? offset + 1 : 0;
  const to = offset + count;
  const known = typeof total === "number";
  const hasNext = known ? to < total : count >= limit;
  return el(
    "div",
    { class: "pager" },
    el("span", { class: "tabular" }, known ? `${fmtNum(from)}–${fmtNum(to)} of ${fmtNum(total)}` : `${fmtNum(from)}–${fmtNum(to)}`),
    el(
      "div",
      { class: "actions" },
      el("button", { class: "btn btn-outline btn-sm", type: "button", disabled: offset <= 0 ? true : null, onClick: () => onPage(Math.max(0, offset - limit)) }, icon("chevronLeft"), "Prev"),
      el("button", { class: "btn btn-outline btn-sm", type: "button", disabled: hasNext ? null : true, onClick: () => onPage(offset + limit) }, "Next", icon("chevronRight")),
    ),
  );
}

// ---------- server-paged list ----------

// cfg: {
//   endpoint, key, limit?, columns, href?, onRow?, empty: [icon,title,sub],
//   filters: [{ kind: 'search'|'select'|'seg', name, placeholder?, options?, default? }],
//   extra?: Node[]   (toolbar actions, right side), live?: ms (adds an auto-refresh toggle)
//   params?: object  (fixed query params)
// }
// Filter state lives in the URL (replaceState), so reloads and shared links keep it.
export function createList(cfg) {
  const limit = cfg.limit || 25;
  const urlQ = new URLSearchParams((location.hash.split("?")[1] || ""));
  const state = { offset: Number(urlQ.get("offset")) || 0 };
  for (const f of cfg.filters || []) state[f.name] = urlQ.get(f.name) ?? f.default ?? "";

  const root = el("section", { class: "card" });
  const tableHost = el("div");
  const pagerHost = el("div");
  const totalEl = el("span", { class: "tabular" });
  let token = 0;
  let firstLoad = true;
  let timer = null;

  const syncUrl = () => {
    // Keep parameters this list doesn't own (e.g. the active tab).
    const q = new URLSearchParams(location.hash.split("?")[1] || "");
    for (const f of cfg.filters || []) q.delete(f.name);
    q.delete("offset");
    for (const f of cfg.filters || []) if (state[f.name] && state[f.name] !== (f.default ?? "")) q.set(f.name, state[f.name]);
    if (state.offset) q.set("offset", state.offset);
    const path = location.hash.split("?")[0];
    history.replaceState(null, "", path + (q.toString() ? "?" + q : ""));
  };

  async function load() {
    const my = ++token;
    if (firstLoad || !tableHost.firstChild) {
      clear(tableHost).append(el("div", { class: "table-wrap" }, el("table", { class: "table" }, el("tbody", {}, skeletonRows(cfg.columns.length)))));
    }
    try {
      const params = { ...(cfg.params || {}), limit, offset: state.offset };
      for (const f of cfg.filters || []) params[f.name] = state[f.name];
      const data = await api.get(cfg.endpoint, params);
      if (my !== token) return;
      firstLoad = false;
      const rows = data[cfg.key] || [];
      clear(tableHost);
      if (!rows.length) {
        const [ic, title, sub] = cfg.empty || ["inbox", "Nothing here", ""];
        tableHost.append(emptyState(ic, title, state.q || state.offset ? "No results match these filters." : sub));
      } else {
        tableHost.append(dataTable(cfg.columns, rows, { href: cfg.href, onRow: cfg.onRow }));
      }
      totalEl.textContent = typeof data.total === "number" ? `${fmtNum(data.total)} total` : "";
      clear(pagerHost);
      if (rows.length || state.offset) pagerHost.append(pager({ offset: state.offset, limit, total: data.total, count: rows.length, onPage: (o) => ((state.offset = o), syncUrl(), load(), root.scrollIntoView({ block: "nearest" })) }));
      cfg.onData?.(data, rows);
    } catch (err) {
      if (my !== token) return;
      clear(tableHost).append(errorState(err, load));
      clear(pagerHost);
    }
  }

  const reset = () => {
    state.offset = 0;
    syncUrl();
    load();
  };

  const toolbar = el("div", { class: "toolbar" });
  for (const f of cfg.filters || []) {
    if (f.kind === "search") {
      const input = el("input", { class: "input", type: "search", placeholder: f.placeholder || "Search…", value: state[f.name], "aria-label": f.placeholder || "Search", autocomplete: "off", spellcheck: "false" });
      const run = debounce(() => {
        state[f.name] = input.value.trim();
        reset();
      }, 260);
      input.addEventListener("input", run);
      input.addEventListener("keydown", (e) => e.key === "Enter" && (run.cancel(), (state[f.name] = input.value.trim()), reset()));
      toolbar.append(el("div", { class: "input-icon" }, icon("search"), input));
    } else if (f.kind === "select") {
      const sel = el("select", { class: "select", "aria-label": f.label || f.name }, f.options.map((o) => el("option", { value: o.value, selected: o.value === state[f.name] ? true : null }, o.label)));
      sel.addEventListener("change", () => ((state[f.name] = sel.value), reset()));
      toolbar.append(sel);
    } else if (f.kind === "seg") {
      toolbar.append(segmented({ options: f.options, value: state[f.name], label: f.label || f.name, onChange: (v) => ((state[f.name] = v), reset()) }));
    }
  }
  const end = el("div", { class: "toolbar-end" }, totalEl);
  if (cfg.live) {
    const toggle = el("button", { class: "btn btn-outline btn-sm", type: "button", "aria-pressed": "false" }, dot("off"), "Live");
    toggle.addEventListener("click", () => {
      const on = toggle.getAttribute("aria-pressed") !== "true";
      toggle.setAttribute("aria-pressed", String(on));
      toggle.firstChild.replaceWith(dot(on ? "" : "off", on));
      clearInterval(timer);
      if (on) timer = setInterval(() => !document.hidden && load(), cfg.live);
    });
    end.append(toggle);
  }
  end.append(el("button", { class: "btn btn-ghost btn-sm btn-icon", type: "button", title: "Refresh", "aria-label": "Refresh", onClick: load }, icon("refresh")), ...(cfg.extra || []));
  toolbar.append(end);

  root.append(toolbar, tableHost, pagerHost);
  load();
  return { node: root, reload: load, destroy: () => (clearInterval(timer), token++) };
}

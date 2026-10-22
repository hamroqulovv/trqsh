// DOM helpers, icons, formatters, toasts and dialogs. Nothing here ever assigns
// untrusted data to innerHTML: text goes through textContent, so API values
// (names, emails, URLs) can't inject markup. Styles are set through the CSSOM
// because the page's CSP forbids style attributes.

const SVG_NS = "http://www.w3.org/2000/svg";
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export { reduceMotion };

function applyProps(node, props) {
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.setAttribute("class", value);
    else if (key === "style") {
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith("--")) node.style.setProperty(prop, v);
        else node.style[prop] = v;
      }
    } else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "text") node.textContent = value;
    else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, String(value));
  }
}

function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function el(tag, props, ...children) {
  const node = document.createElement(tag);
  applyProps(node, props);
  return append(node, children);
}

export function svg(tag, props, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, String(value));
  }
  return append(node, children);
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

// Replace a node's children, skipping null/false (unlike Node.append, which would
// render them as the text "null").
export function fill(node, ...children) {
  node.replaceChildren();
  return append(node, children);
}

// ---------- icons (24px grid, stroke) ----------

const ICONS = {
  gauge: '<path d="M12 14l4-4"/><path d="M3.3 17a10 10 0 1 1 17.4 0"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  radio: '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  scroll: '<path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/>',
  server: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.7 8.9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z"/><path d="M12 9v4M12 17h.01"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
  terminal: '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
  filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
};

export function icon(name, cls = "") {
  const t = document.createElement("template");
  t.innerHTML = `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
  return t.content.firstChild;
}

// ---------- formatters ----------

const nf = new Intl.NumberFormat("en-US");
export const fmtNum = (n) => nf.format(Number(n) || 0);

export function fmtCompact(n) {
  n = Number(n) || 0;
  if (Math.abs(n) < 1000) return String(n);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function fmtBytes(n, digits = 1) {
  n = Number(n) || 0;
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0;
  while (Math.abs(n) >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${i === 0 ? n : n.toFixed(n >= 100 ? 0 : digits)} ${units[i]}`;
}

export function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) || d.getFullYear() < 1971 ? null : d;
}

export function fmtDate(v) {
  const d = toDate(v);
  return d ? d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
}

export function fmtDateTime(v) {
  const d = toDate(v);
  return d ? d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}

export function relTime(v) {
  const d = toDate(v);
  if (!d) return "—";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  const abs = Math.abs(s);
  const fut = s < 0;
  const unit = abs < 60 ? [abs, "s"] : abs < 3600 ? [Math.floor(abs / 60), "m"] : abs < 86400 ? [Math.floor(abs / 3600), "h"] : abs < 86400 * 45 ? [Math.floor(abs / 86400), "d"] : [Math.floor(abs / 86400 / 30), "mo"];
  if (abs < 5) return "just now";
  return fut ? `in ${unit[0]}${unit[1]}` : `${unit[0]}${unit[1]} ago`;
}

// A <time> element: relative text, absolute on hover.
export function timeEl(v) {
  const d = toDate(v);
  if (!d) return el("span", { class: "muted" }, "—");
  return el("time", { datetime: d.toISOString(), title: d.toLocaleString() }, relTime(d));
}

export function fmtDuration(startV, endV) {
  const a = toDate(startV);
  if (!a) return "—";
  const b = toDate(endV) || new Date();
  let s = Math.max(0, Math.round((b - a) / 1000));
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s - m * 60}s`;
  return `${s}s`;
}

export const initials = (s) => (String(s || "?").trim().match(/[\p{L}\p{N}]/u) || ["?"])[0];
export const plural = (n, one, many = one + "s") => `${fmtNum(n)} ${n === 1 ? one : many}`;

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

// ---------- clipboard & toasts ----------

let toastHost;
export function toast(message, kind = "ok") {
  if (!toastHost) {
    toastHost = el("div", { class: "toast-viewport", role: "region", "aria-label": "Notifications", "aria-live": "polite" });
    document.body.append(toastHost);
  }
  const ms = kind === "error" ? 6500 : 3800;
  const node = el(
    "div",
    { class: "toast", role: kind === "error" ? "alert" : "status", dataset: { kind }, style: { "--toast-ms": ms + "ms" } },
    icon(kind === "error" ? "alert" : "check"),
    el("div", {}, message),
    el("span", { class: "toast-timer" }),
  );
  toastHost.append(node);
  const leave = () => {
    node.dataset.leaving = "";
    setTimeout(() => node.remove(), 230);
  };
  const timer = setTimeout(leave, ms);
  node.addEventListener("click", () => {
    clearTimeout(timer);
    leave();
  });
}

export async function copyText(text, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    toast("Copy is blocked by the browser", "error");
  }
}

// ---------- dialogs ----------

export function openDialog({ title, body, footer, wide = false, onClose }) {
  const dialog = el("dialog", { class: "modal", "aria-label": title });
  const close = (result) => {
    if (dialog.dataset.closing) return;
    dialog.dataset.closing = "";
    setTimeout(
      () => {
        dialog.close();
        dialog.remove();
        onClose?.(result);
      },
      reduceMotion() ? 0 : 170,
    );
  };
  const panel = el(
    "div",
    { class: "modal-panel" + (wide ? " wide" : "") },
    el("div", { class: "modal-head" }, el("h2", {}, title), el("button", { class: "btn btn-ghost btn-sm btn-icon", type: "button", "aria-label": "Close", onClick: () => close(null) }, icon("x"))),
    body,
    footer || null,
  );
  dialog.append(panel);
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close(null);
  });
  dialog.addEventListener("mousedown", (e) => {
    if (e.target === dialog) close(null);
  });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, close };
}

// Resolves true when confirmed. `typed` makes the operator retype a value (an org
// name, an email) before the destructive button is enabled.
export function confirmDialog({ title, message, confirmLabel = "Confirm", danger = false, typed = null, extra = null }) {
  return new Promise((resolve) => {
    let handle;
    const confirm = el("button", { class: "btn " + (danger ? "btn-danger" : "btn-primary"), type: "button", disabled: typed ? true : null }, confirmLabel);
    const cancel = el("button", { class: "btn btn-outline", type: "button", onClick: () => handle.close(false) }, "Cancel");
    const body = el("div", { class: "modal-body" }, el("p", {}, message), extra);
    if (typed) {
      const input = el("input", { class: "input", autocomplete: "off", spellcheck: "false", "aria-label": "Type to confirm" });
      input.addEventListener("input", () => {
        confirm.disabled = input.value.trim() !== typed;
      });
      body.append(el("div", { class: "field" }, el("label", {}, ["Type ", el("code", {}, typed), " to confirm"]), input));
    }
    confirm.addEventListener("click", () => handle.close(true));
    handle = openDialog({ title, body, footer: el("div", { class: "modal-foot" }, cancel, confirm), onClose: (r) => resolve(r === true) });
    (typed ? body.querySelector("input") : confirm).focus();
  });
}

// A dialog with a small form. onSubmit(values) may throw to show an inline error;
// resolves with onSubmit's result, or null if dismissed.
export function formDialog({ title, intro, fields, submitLabel = "Save", danger = false, onSubmit }) {
  return new Promise((resolve) => {
    let handle;
    const err = el("div", { class: "alert alert-hatch hidden", role: "alert" });
    const inputs = {};
    const rows = fields.map((f) => {
      let input;
      if (f.type === "select") {
        input = el("select", { class: "select", name: f.name, id: "f-" + f.name }, f.options.map((o) => el("option", { value: o.value, selected: String(o.value) === String(f.value ?? "") ? true : null }, o.label)));
      } else if (f.type === "textarea") {
        input = el("textarea", { class: "textarea", name: f.name, id: "f-" + f.name, placeholder: f.placeholder }, f.value ?? "");
      } else {
        input = el("input", { class: "input", name: f.name, id: "f-" + f.name, type: f.type || "text", value: f.value ?? "", placeholder: f.placeholder, min: f.min, max: f.max, required: f.required ? true : null, autocomplete: "off" });
      }
      inputs[f.name] = input;
      return el("div", { class: "field" }, el("label", { for: "f-" + f.name }, f.label), input, f.hint ? el("div", { class: "hint" }, f.hint) : null);
    });
    const submit = el("button", { class: "btn " + (danger ? "btn-danger" : "btn-primary"), type: "submit" }, submitLabel);
    const form = el("form", { class: "modal-body", novalidate: true }, intro ? el("p", {}, intro) : null, rows, err);
    const foot = el("div", { class: "modal-foot" }, el("button", { class: "btn btn-outline", type: "button", onClick: () => handle.close(null) }, "Cancel"), submit);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const values = Object.fromEntries(Object.entries(inputs).map(([k, n]) => [k, n.value]));
      submit.disabled = true;
      err.classList.add("hidden");
      try {
        const out = await onSubmit(values);
        handle.close(out ?? true);
      } catch (ex) {
        err.textContent = ex.message || "Something went wrong";
        err.classList.remove("hidden");
        submit.disabled = false;
      }
    });
    // The submit button lives in the footer, outside the form element.
    submit.setAttribute("form", "admin-form");
    form.id = "admin-form";
    handle = openDialog({ title, body: form, footer: foot, onClose: (r) => resolve(r) });
    form.querySelector("input,select,textarea")?.focus();
  });
}

// Pointer-follow highlight on cards (see .spotlight). One listener per container.
export function spotlight(container) {
  container.addEventListener("pointermove", (e) => {
    for (const card of container.querySelectorAll(".spotlight")) {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", e.clientX - r.left + "px");
      card.style.setProperty("--my", e.clientY - r.top + "px");
    }
    container.dataset.spot = "";
  });
  container.addEventListener("pointerleave", () => delete container.dataset.spot);
}

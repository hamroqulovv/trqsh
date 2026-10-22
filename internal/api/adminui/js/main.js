// Boot, sign-in, shell and hash router for the admin console.
import { el, icon, clear, spotlight } from "./dom.js";
import { session, hooks } from "./api.js";
import { openPalette } from "./palette.js";

const root = document.getElementById("root");

// ---------- theme ----------

export function setTheme(mode) {
  try {
    localStorage.setItem("trqsh-admin-theme", mode);
  } catch {
    /* private mode */
  }
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const apply = () => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dataset.theme = mode;
  };
  if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(apply);
  else apply();
}
export const currentTheme = () => document.documentElement.dataset.theme || "system";
const isDark = () => document.documentElement.classList.contains("dark");
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => currentTheme() === "system" && setTheme("system"));

// ---------- navigation model ----------

export const NAV = [
  { title: "Monitor", items: [{ id: "overview", label: "Overview", icon: "gauge", href: "#/" }, { id: "tunnels", label: "Tunnels", icon: "radio", href: "#/tunnels" }] },
  { title: "Accounts", items: [{ id: "users", label: "Users", icon: "users", href: "#/users" }, { id: "orgs", label: "Organizations", icon: "building", href: "#/orgs" }] },
  { title: "Resources", items: [{ id: "keys", label: "API keys", icon: "key", href: "#/keys" }, { id: "domains", label: "Domains", icon: "globe", href: "#/domains" }] },
  { title: "Business", items: [{ id: "billing", label: "Billing", icon: "card", href: "#/billing" }] },
  { title: "Operations", items: [{ id: "audit", label: "Audit log", icon: "scroll", href: "#/audit" }, { id: "system", label: "System", icon: "server", href: "#/system" }] },
];

const ROUTES = [
  { re: /^\/?$/, page: "overview", nav: "overview", title: "Overview" },
  { re: /^\/users$/, page: "users", nav: "users", title: "Users" },
  { re: /^\/users\/([^/]+)$/, page: "user", nav: "users", title: "User" },
  { re: /^\/orgs$/, page: "orgs", nav: "orgs", title: "Organizations" },
  { re: /^\/orgs\/([^/]+)$/, page: "org", nav: "orgs", title: "Organization" },
  { re: /^\/tunnels$/, page: "tunnels", nav: "tunnels", title: "Tunnels" },
  { re: /^\/keys$/, page: "keys", nav: "keys", title: "API keys" },
  { re: /^\/domains$/, page: "domains", nav: "domains", title: "Domains" },
  { re: /^\/billing$/, page: "billing", nav: "billing", title: "Billing" },
  { re: /^\/audit$/, page: "audit", nav: "audit", title: "Audit log" },
  { re: /^\/system$/, page: "system", nav: "system", title: "System" },
];

// ---------- sign-in ----------

function showLogin(message = "") {
  cleanup?.();
  cleanup = null;
  document.body.removeAttribute("data-nav");
  const err = el("div", { class: "alert alert-hatch" + (message ? "" : " hidden"), role: "alert" }, icon("alert"), el("span", {}, message));
  const user = el("input", { class: "input", id: "u", name: "username", autocomplete: "username", required: true, autofocus: true });
  const pass = el("input", { class: "input", id: "p", name: "password", type: "password", autocomplete: "current-password", required: true });
  const btn = el("button", { class: "btn btn-primary btn-block", type: "submit" }, "Sign in");
  const card = el(
    "form",
    { class: "card login-card spotlight", novalidate: true },
    el("div", { class: "brand" }, el("span", { class: "brand-mark" }, icon("terminal", "ico-lg")), "trqsh", el("span", { class: "badge" }, "admin")),
    el("div", {}, el("h1", {}, "Sign in"), el("p", { class: "muted" }, "Operator access to this deployment.")),
    err,
    el("div", { class: "login-form" }, el("div", { class: "field" }, el("label", { for: "u" }, "Username"), user), el("div", { class: "field" }, el("label", { for: "p" }, "Password"), pass), btn),
  );
  card.addEventListener("submit", async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.replaceChildren(icon("refresh", "spin"), "Signing in…");
    err.classList.add("hidden");
    try {
      await session.login(user.value, pass.value);
      boot();
    } catch (ex) {
      err.lastChild.textContent = ex.status === 404 ? "The admin console is disabled on this deployment." : ex.status === 429 ? "Too many attempts. Wait a moment and try again." : ex.message;
      err.classList.remove("hidden");
      card.classList.remove("shake");
      void card.offsetWidth;
      card.classList.add("shake");
      btn.disabled = false;
      btn.replaceChildren("Sign in");
      pass.select();
    }
  });
  clear(root).append(el("main", { class: "login", id: "main" }, card));
  spotlight(root);
  user.focus();
}

// ---------- shell ----------

let cleanup = null;
let view = null; // { main, crumbs, nav }
let navAbort = 0;

function buildShell() {
  const nav = el("nav", { class: "sidebar", "aria-label": "Primary" }, el("a", { class: "brand", href: "#/" }, el("span", { class: "brand-mark" }, icon("terminal", "ico-lg")), "trqsh", el("span", { class: "badge" }, "admin")));
  const links = new Map();
  for (const g of NAV) {
    const group = el("div", { class: "nav-group" }, el("div", { class: "nav-title" }, g.title));
    for (const it of g.items) {
      const a = el("a", { class: "nav-item", href: it.href }, icon(it.icon), it.label);
      links.set(it.id, a);
      group.append(a);
    }
    nav.append(group);
  }
  nav.append(
    el(
      "div",
      { class: "sidebar-foot" },
      el("button", { class: "btn btn-outline btn-block", type: "button", onClick: () => openPalette() }, icon("search"), "Search…", el("span", { class: "kbd", style: { marginLeft: "auto" } }, "Ctrl K")),
      el("button", { class: "btn btn-ghost btn-block", type: "button", onClick: signOut, style: { justifyContent: "flex-start" } }, icon("logout"), "Sign out"),
    ),
  );

  const crumbs = el("div", { class: "crumbs" });
  const themeBtn = el("button", { class: "btn btn-ghost btn-icon", type: "button", "aria-label": "Toggle theme", onClick: () => setTheme(isDark() ? "light" : "dark") });
  const syncTheme = () => themeBtn.replaceChildren(icon(isDark() ? "sun" : "moon"));
  syncTheme();
  new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  const topbar = el(
    "header",
    { class: "topbar" },
    el("button", { class: "btn btn-ghost btn-icon menu-btn", type: "button", "aria-label": "Open menu", onClick: () => (document.body.dataset.nav = "open") }, icon("menu")),
    crumbs,
    el("div", { class: "topbar-space" }),
    el("button", { class: "search-trigger", type: "button", onClick: () => openPalette(), "aria-label": "Search" }, icon("search"), el("span", { class: "search-label" }, "Search users, orgs, domains…"), el("span", { class: "kbd" }, "Ctrl K")),
    themeBtn,
  );
  const main = el("main", { id: "main", tabindex: -1 });
  const scrim = el("div", { class: "scrim", onClick: () => document.body.removeAttribute("data-nav") });
  clear(root).append(el("div", { class: "app" }, nav, el("div", { class: "main" }, topbar, main)), scrim);
  nav.addEventListener("click", (e) => e.target.closest("a") && document.body.removeAttribute("data-nav"));
  return { main, crumbs, links };
}

async function signOut() {
  await session.logout().catch(() => {});
  showLogin();
}

export function setCrumbs(list) {
  if (!view) return;
  clear(view.crumbs);
  list.forEach((c, i) => {
    if (i) view.crumbs.append(icon("chevronRight"));
    view.crumbs.append(c.href ? el("a", { href: c.href }, c.label) : el("span", { class: "cur" }, c.label));
  });
  document.title = `${list[list.length - 1]?.label || "Admin"} · trqsh admin`;
}

async function route() {
  if (!view) return;
  const my = ++navAbort;
  cleanup?.();
  cleanup = null;
  const full = location.hash.replace(/^#/, "") || "/";
  const [path] = full.split("?");
  const match = ROUTES.map((r) => ({ r, m: path.match(r.re) })).find((x) => x.m);
  const r = match?.r || { page: "notfound", nav: "", title: "Not found" };
  for (const [id, a] of view.links) id === r.nav ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
  setCrumbs([{ label: r.title }]);
  clear(view.main).append(el("div", { class: "page page-enter" }));
  const host = view.main.firstChild;
  try {
    const mod = await import(`./pages/${r.page}.js`);
    if (my !== navAbort) return;
    const out = await mod.default(host, { params: match ? match.m.slice(1).map(decodeURIComponent) : [], setCrumbs });
    if (my !== navAbort) {
      out?.();
      return;
    }
    cleanup = typeof out === "function" ? out : null;
    spotlight(host);
    window.scrollTo({ top: 0 });
  } catch (ex) {
    if (my !== navAbort) return;
    console.error(ex);
    clear(host).append(el("div", { class: "empty" }, icon("alert"), el("strong", {}, "This page failed to load"), el("span", {}, ex.message)));
  }
}

async function boot() {
  view = buildShell();
  window.removeEventListener("hashchange", route);
  window.addEventListener("hashchange", route);
  route();
}

// Global shortcuts: Ctrl/Cmd+K and "/" open the palette.
addEventListener("keydown", (e) => {
  if (!view) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "") || document.activeElement?.isContentEditable;
  if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    openPalette();
  } else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !document.querySelector("dialog[open]")) {
    e.preventDefault();
    openPalette();
  } else if (e.key === "Escape") document.body.removeAttribute("data-nav");
});

let expired = false;
hooks.onExpire = () => {
  if (expired) return;
  expired = true;
  view = null;
  showLogin("Your session expired. Sign in again.");
  setTimeout(() => (expired = false), 500);
};

// Resume an existing session, else show the sign-in screen.
session
  .resume()
  .then(boot)
  .catch((ex) => showLogin(ex.status === 404 ? "The admin console is disabled on this deployment." : ""));


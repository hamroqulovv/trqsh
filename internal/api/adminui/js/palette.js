// Command palette (Ctrl/Cmd+K or "/"): jump to any page, or search users, orgs,
// domains and subdomains across the whole deployment.
import { el, icon, clear, debounce } from "./dom.js";
import { api, A } from "./api.js";
import { NAV, setTheme, currentTheme } from "./main.js";

let open = false;

function commands() {
  const pages = NAV.flatMap((g) => g.items.map((i) => ({ group: "Pages", icon: i.icon, label: i.label, meta: "Go to", run: () => (location.hash = i.href) })));
  return [
    ...pages,
    { group: "Actions", icon: "sun", label: "Theme: light", run: () => setTheme("light") },
    { group: "Actions", icon: "moon", label: "Theme: dark", run: () => setTheme("dark") },
    { group: "Actions", icon: "cpu", label: "Theme: follow system", meta: currentTheme() === "system" ? "current" : "", run: () => setTheme("system") },
    { group: "Actions", icon: "refresh", label: "Reload this page", run: () => location.reload() },
  ];
}

export function openPalette() {
  if (open) return;
  open = true;
  const dialog = el("dialog", { class: "modal", "aria-label": "Search" });
  const input = el("input", { type: "text", placeholder: "Search users, orgs, domains — or jump to a page", "aria-label": "Search", autocomplete: "off", spellcheck: "false", role: "combobox", "aria-expanded": "true", "aria-controls": "palette-list" });
  const list = el("div", { class: "palette-list", id: "palette-list", role: "listbox" });
  let items = [];
  let sel = 0;
  let token = 0;
  let remote = [];

  const close = () => {
    dialog.dataset.closing = "";
    setTimeout(() => {
      dialog.close();
      dialog.remove();
      open = false;
    }, 120);
  };
  const run = (item) => {
    close();
    setTimeout(() => item.run(), 130);
  };

  function render() {
    const q = input.value.trim().toLowerCase();
    const local = commands().filter((c) => !q || c.label.toLowerCase().includes(q));
    items = [...remote, ...local];
    sel = Math.min(sel, Math.max(0, items.length - 1));
    clear(list);
    if (!items.length) {
      list.append(el("div", { class: "empty" }, el("strong", {}, q.length < 2 ? "Type to search" : "No matches"), el("span", {}, q.length < 2 ? "Two or more characters searches the whole deployment." : `Nothing found for “${input.value.trim()}”.`)));
      return;
    }
    let lastGroup = "";
    items.forEach((it, i) => {
      if (it.group !== lastGroup) {
        list.append(el("div", { class: "palette-group" }, it.group));
        lastGroup = it.group;
      }
      const row = el("button", { class: "palette-item", type: "button", role: "option", "aria-selected": String(i === sel), id: "pi-" + i }, icon(it.icon), el("span", {}, it.label), it.meta ? el("span", { class: "meta" }, it.meta) : null);
      row.addEventListener("click", () => run(it));
      row.addEventListener("pointermove", () => {
        if (sel !== i) {
          sel = i;
          mark();
        }
      });
      list.append(row);
    });
  }

  function mark() {
    list.querySelectorAll(".palette-item").forEach((n, i) => n.setAttribute("aria-selected", String(i === sel)));
    list.querySelector(`#pi-${sel}`)?.scrollIntoView({ block: "nearest" });
    input.setAttribute("aria-activedescendant", "pi-" + sel);
  }

  const search = debounce(async () => {
    const q = input.value.trim();
    const my = ++token;
    if (q.length < 2) {
      remote = [];
      render();
      return;
    }
    try {
      const d = await api.get(`${A}/search`, { q });
      if (my !== token) return;
      remote = [
        ...d.users.map((u) => ({ group: "Users", icon: "user", label: u.name ? `${u.name} · ${u.email}` : u.email, meta: u.disabled ? "suspended" : "", run: () => (location.hash = `#/users/${encodeURIComponent(u.id)}`) })),
        ...d.orgs.map((o) => ({ group: "Organizations", icon: "building", label: o.name, meta: o.suspended ? `${o.plan} · suspended` : o.plan, run: () => (location.hash = `#/orgs/${encodeURIComponent(o.id)}`) })),
        ...d.domains.map((x) => ({ group: "Domains", icon: "globe", label: x.domain, meta: x.org_name, run: () => (location.hash = `#/orgs/${encodeURIComponent(x.org_id)}`) })),
        ...d.subdomains.map((x) => ({ group: "Subdomains", icon: "link", label: x.subdomain, meta: x.org_name, run: () => (location.hash = `#/orgs/${encodeURIComponent(x.org_id)}`) })),
      ];
      render();
    } catch {
      /* the list keeps showing local results */
    }
  }, 160);

  input.addEventListener("input", () => {
    sel = 0;
    render();
    search();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      mark();
    } else if (e.key === "Enter" && items[sel]) {
      e.preventDefault();
      run(items[sel]);
    }
  });
  dialog.addEventListener("cancel", (e) => (e.preventDefault(), close()));
  dialog.addEventListener("mousedown", (e) => e.target === dialog && close());

  dialog.append(
    el(
      "div",
      { class: "palette" },
      el("div", { class: "palette-input" }, icon("search", "ico-lg"), input, el("span", { class: "kbd" }, "Esc")),
      list,
      el("div", { class: "palette-foot" }, el("span", {}, "↑↓ navigate"), el("span", {}, "↵ open"), el("span", {}, "esc close")),
    ),
  );
  document.body.append(dialog);
  dialog.showModal();
  render();
  input.focus();
}

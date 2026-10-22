import { el, icon, clear, fill, fmtDateTime, timeEl, toast, confirmDialog, formDialog } from "../dom.js";
import { api, A } from "../api.js";
import { card, kv, avatar, planBadge, suspendedBadge, activeBadge, roleBadge, copyChip, errorState, dataTable } from "../kit.js";
import { auditEntry } from "./audit.js";

export default async function mount(host, { params, setCrumbs }) {
  const id = params[0];
  const body = el("div", { class: "stack" });
  host.append(body);

  async function load() {
    let d;
    try {
      d = await api.get(`${A}/users/${encodeURIComponent(id)}`);
    } catch (err) {
      setCrumbs([{ label: "Users", href: "#/users" }, { label: "Not found" }]);
      clear(body).append(el("div", { class: "card" }, errorState(err, err.status === 404 ? null : load)));
      return;
    }
    const u = d.user;
    const name = u.name || u.email;
    setCrumbs([{ label: "Users", href: "#/users" }, { label: name }]);
    const disabled = !!u.disabled_at;

    const rename = async () => {
      const out = await formDialog({
        title: "Rename user",
        fields: [{ name: "name", label: "Display name", value: u.name, required: true }],
        submitLabel: "Save",
        onSubmit: async (v) => api.patch(`${A}/users/${encodeURIComponent(id)}`, { name: v.name }),
      });
      if (out) (toast("Name updated"), load());
    };
    const suspend = async () => {
      const out = await formDialog({
        title: `Suspend ${u.email}?`,
        intro: "They won't be able to sign in or refresh a session. A browser that is already signed in keeps working for up to an hour. Their organizations and API keys are not touched; suspend an organization to cut off its tunnels.",
        fields: [{ name: "reason", label: "Reason (shown to staff only)", type: "textarea", placeholder: "e.g. abuse report #123" }],
        submitLabel: "Suspend user",
        danger: true,
        onSubmit: (v) => api.post(`${A}/users/${encodeURIComponent(id)}/disable`, { reason: v.reason }),
      });
      if (out) (toast("User suspended"), load());
    };
    const reinstate = async () => {
      if (!(await confirmDialog({ title: "Reinstate user?", message: `${u.email} will be able to sign in again.`, confirmLabel: "Reinstate" }))) return;
      try {
        await api.post(`${A}/users/${encodeURIComponent(id)}/enable`);
        toast("User reinstated");
        load();
      } catch (e) {
        toast(e.message, "error");
      }
    };
    const remove = async () => {
      const sole = d.orgs.filter((o) => o.members === 1);
      const ok = await confirmDialog({
        title: "Delete user permanently?",
        message: `This removes ${u.email} and cannot be undone.${sole.length ? ` ${sole.length === 1 ? "Their only organization" : `${sole.length} organizations they alone belong to`} will be deleted with all keys, domains, usage and history.` : ""}`,
        confirmLabel: "Delete user",
        danger: true,
        typed: u.email,
      });
      if (!ok) return;
      try {
        await api.del(`${A}/users/${encodeURIComponent(id)}`, { confirm: u.email });
        toast("User deleted");
        location.hash = "#/users";
      } catch (e) {
        toast(e.message, "error");
      }
    };

    const head = el(
      "div",
      { class: "page-head" },
      el(
        "div",
        { class: "profile" },
        avatar(name, true),
        el("div", {}, el("h1", {}, name), el("div", { class: "muted" }, u.email), el("div", { class: "chips" }, disabled ? suspendedBadge("Suspended", u.disabled_reason) : activeBadge(), ...d.providers.map((p) => el("span", { class: "badge" }, p)))),
      ),
      el(
        "div",
        { class: "actions" },
        el("button", { class: "btn btn-outline", type: "button", onClick: rename }, icon("pencil"), "Rename"),
        disabled ? el("button", { class: "btn btn-outline", type: "button", onClick: reinstate }, icon("check"), "Reinstate") : el("button", { class: "btn btn-outline", type: "button", onClick: suspend }, icon("ban"), "Suspend"),
        el("button", { class: "btn btn-danger", type: "button", onClick: remove }, icon("trash"), "Delete"),
      ),
    );

    const banner = disabled
      ? el("div", { class: "alert alert-hatch" }, icon("ban"), el("div", {}, el("strong", {}, "This account is suspended."), ` Since ${fmtDateTime(u.disabled_at)}${u.disabled_reason ? ` — ${u.disabled_reason}` : ""}.`))
      : null;

    const profile = card("Profile", {
      body: kv([
        ["User ID", copyChip(u.id)],
        ["Email", u.email],
        ["Name", u.name || null],
        ["Sign-in methods", d.providers.length ? d.providers.map((p) => el("span", { class: "badge" }, p)) : el("span", { class: "muted" }, "email only")],
        ["Joined", el("span", {}, fmtDateTime(u.created_at), " ", el("span", { class: "muted" }, "(", timeEl(u.created_at), ")"))],
      ]),
    });

    const orgs = card("Organizations", {
      sub: `${d.orgs.length} membership${d.orgs.length === 1 ? "" : "s"}`,
      pad: false,
      body: d.orgs.length
        ? dataTable(
            [
              { label: "Organization", render: (o) => el("div", { class: "cell-text" }, el("span", { class: "cell-title" }, o.name), el("span", { class: "cell-sub mono" }, o.id)) },
              { label: "Role", render: (o) => roleBadge(o.role) },
              { label: "Plan", render: (o) => planBadge(o.plan, o.plan_expires_at) },
              { label: "Members", num: true, render: (o) => o.members },
              { label: "Status", render: (o) => (o.suspended_at ? suspendedBadge() : activeBadge()) },
            ],
            d.orgs,
            { href: (o) => `#/orgs/${encodeURIComponent(o.id)}` },
          )
        : el("div", { class: "empty" }, "Not a member of any organization."),
    });

    const activity = card("Admin history", {
      sub: "Changes made to this account from the console",
      body: d.audit.length ? el("ol", { class: "timeline" }, d.audit.map((e) => auditEntry(e))) : el("div", { class: "muted" }, "Nothing yet."),
    });

    fill(body, head, banner, el("div", { class: "grid g-7-5" }, el("div", { class: "stack" }, orgs, activity), profile));
  }

  await load();
}

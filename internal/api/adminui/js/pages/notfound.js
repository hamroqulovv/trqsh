import { el, icon } from "../dom.js";

export default async function mount(host) {
  host.append(
    el(
      "div",
      { class: "card" },
      el("div", { class: "empty" }, icon("search"), el("strong", {}, "Page not found"), el("span", {}, "That address doesn't exist in the console."), el("a", { class: "btn btn-outline btn-sm", href: "#/" }, "Back to overview")),
    ),
  );
}

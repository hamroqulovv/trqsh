// Inline-SVG charts. Series are told apart by line style (solid vs dashed) as well
// as weight, so the chart reads in monochrome and for colour-blind viewers.
import { el, svg, fmtBytes, fmtNum, fmtCompact, reduceMotion } from "./dom.js";

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function niceBytesMax(v) {
  if (v <= 0) return 1024;
  const e = Math.floor(Math.log(v) / Math.log(1024));
  const base = Math.pow(1024, e);
  return niceMax(v / base) * base;
}

// points: [{ t: Date, a: number, b: number, c: number }] sorted by time.
// a = inbound bytes, b = outbound bytes, c = requests.
export function trafficChart(points, { height = 240, bucket = "day" } = {}) {
  const wrap = el("div", { class: "chart-wrap" });
  if (!points.length) {
    wrap.append(el("div", { class: "empty" }, el("strong", {}, "No traffic recorded"), el("span", {}, "Nothing was metered in this window.")));
    return wrap;
  }
  const tip = el("div", { class: "tip", hidden: true });
  wrap.append(tip);
  let host = null;

  const draw = () => {
    const width = Math.max(260, wrap.clientWidth || 600);
    const m = { l: 56, r: 12, t: 12, b: 26 };
    const w = width - m.l - m.r;
    const h = height - m.t - m.b;
    const max = niceBytesMax(Math.max(...points.map((p) => Math.max(p.a, p.b)), 1));
    const x = (i) => m.l + (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
    const y = (v) => m.t + h - (v / max) * h;
    const path = (key) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");

    const root = svg("svg", { class: "chart", width, height, viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "Traffic over time: inbound and outbound bytes" });
    for (let i = 0; i <= 4; i++) {
      const gy = m.t + (h / 4) * i;
      root.append(svg("line", { class: "grid-line", x1: m.l, x2: m.l + w, y1: gy, y2: gy }));
      root.append(svg("text", { class: "axis", x: m.l - 8, y: gy + 3.5, "text-anchor": "end" }, fmtBytes(max - (max / 4) * i, 0)));
    }
    const label = (p) => (bucket === "hour" ? p.t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : p.t.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
    const ticks = points.length < 3 ? points.map((_, i) => i) : [0, Math.floor((points.length - 1) / 2), points.length - 1];
    for (const i of ticks) {
      root.append(svg("text", { class: "axis", x: x(i), y: height - 6, "text-anchor": i === 0 && points.length > 1 ? "start" : i === points.length - 1 && points.length > 1 ? "end" : "middle" }, label(points[i])));
    }
    if (points.length > 1) {
      root.append(svg("path", { class: "area-1", d: `${path("a")} L${x(points.length - 1)} ${m.t + h} L${x(0)} ${m.t + h} Z` }));
      // The solid line draws itself; the dashed one fades in (a draw animation
      // would replace its dash pattern with a solid stroke).
      root.append(svg("path", { class: "line-2" + (reduceMotion() ? "" : " fade"), d: path("b") }));
      root.append(svg("path", { class: "line-1" + (reduceMotion() ? "" : " draw"), d: path("a"), pathLength: 1 }));
    } else {
      root.append(svg("circle", { cx: x(0), cy: y(points[0].a), r: 4, fill: "currentColor" }));
    }

    const vline = svg("line", { class: "hover-line", y1: m.t, y2: m.t + h, visibility: "hidden" });
    const da = svg("circle", { class: "hover-dot", r: 4, visibility: "hidden" });
    const db = svg("circle", { class: "hover-dot", r: 4, visibility: "hidden" });
    root.append(vline, da, db);
    const hit = svg("rect", { class: "hit", x: m.l, y: m.t, width: w, height: h });
    const show = (ev) => {
      const r = root.getBoundingClientRect();
      const px = ev.clientX - r.left;
      const i = Math.max(0, Math.min(points.length - 1, Math.round(((px - m.l) / w) * (points.length - 1))));
      const p = points[i];
      for (const [node, key] of [[da, "a"], [db, "b"]]) {
        node.setAttribute("cx", x(i));
        node.setAttribute("cy", y(p[key]));
        node.setAttribute("visibility", "visible");
      }
      vline.setAttribute("x1", x(i));
      vline.setAttribute("x2", x(i));
      vline.setAttribute("visibility", "visible");
      tip.replaceChildren(
        el("b", {}, p.t.toLocaleString(undefined, bucket === "hour" ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" } : { weekday: "short", month: "short", day: "numeric" })),
        el("div", {}, el("span", {}, "Inbound"), el("span", {}, fmtBytes(p.a))),
        el("div", {}, el("span", {}, "Outbound"), el("span", {}, fmtBytes(p.b))),
        el("div", {}, el("span", {}, "Requests"), el("span", {}, fmtNum(p.c))),
      );
      tip.hidden = false;
      tip.style.left = Math.max(80, Math.min(width - 80, x(i))) + "px";
      tip.style.top = y(Math.max(p.a, p.b)) + "px";
    };
    hit.addEventListener("pointermove", show);
    hit.addEventListener("pointerdown", show);
    hit.addEventListener("pointerleave", () => {
      tip.hidden = true;
      for (const n of [vline, da, db]) n.setAttribute("visibility", "hidden");
    });
    root.append(hit);
    host?.remove();
    host = root;
    wrap.prepend(root);
  };

  // Draw once the element has a width, and again whenever it changes.
  const ro = new ResizeObserver(() => requestAnimationFrame(draw));
  ro.observe(wrap);
  wrap.destroy = () => ro.disconnect();
  return wrap;
}

// Minimal sparkline for stat tiles. values: number[]
export function sparkline(values, { width = 160, height = 26 } = {}) {
  if (values.length < 2 || Math.max(...values) <= 0) return null;
  const max = Math.max(...values);
  const step = width / (values.length - 1);
  const d = values.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)} ${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`).join(" ");
  return svg(
    "svg",
    { class: "chart spark", viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: "none", width: "100%", height, "aria-hidden": "true" },
    svg("path", { class: "area-1", d: `${d} L${width} ${height} L0 ${height} Z` }),
    svg("path", { class: "line-1", d, "vector-effect": "non-scaling-stroke" }),
  );
}

// Horizontal bars. items: [{ label: string|Node, value: number, display?: string }]
export function hbars(items, { empty = "No data yet.", max } = {}) {
  if (!items.length) return el("div", { class: "muted" }, empty);
  const top = max ?? Math.max(...items.map((i) => i.value), 1);
  return el(
    "div",
    { class: "bars" },
    items.map((it, idx) =>
      el(
        "div",
        { class: "bar-row" },
        el("div", { class: "bar-label", title: typeof it.label === "string" ? it.label : "" }, it.label),
        el("div", { class: "bar-track" }, el("div", { class: "bar-fill", style: { width: Math.max(2, (it.value / top) * 100) + "%", "--i": idx } })),
        el("div", { class: "bar-val" }, it.display ?? fmtCompact(it.value)),
      ),
    ),
  );
}

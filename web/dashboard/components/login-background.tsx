"use client";

import { useEffect, useRef } from "react";
import { createAsciiRenderer, type AsciiRenderer } from "./ascii-renderer";

type InputPoint = { x: number; y: number; age: number };
const glyphs = " .:-=+xX0#@";
const fallback = Array.from({ length: 32 }, (_, row) =>
  Array.from({ length: 110 }, (_, column) => {
    const x = (column - 55) / 55;
    const horizon = 20 - x * x * 7;
    const distance = (row - horizon) / 5;
    const intensity = Math.exp(-distance * distance) * (0.65 + Math.sin(column * 1.7 + row * 2.3) * 0.35);
    return glyphs[Math.min(glyphs.length - 1, Math.floor(intensity * glyphs.length))];
  }).join(""),
).join("\n");

export function LoginBackground() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const page = host.closest<HTMLElement>(".login-page");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compact = window.matchMedia("(max-width: 767px)");
    const fine = window.matchMedia("(pointer: fine)");
    let renderer: AsciiRenderer | null = null;
    let sized = false;
    let disposed = false;
    let lost = false;
    let visible = false;
    let frame = 0;
    let resizeFrame = 0;
    let previous: number | null = null;
    let lastRender = 0;
    let elapsed = 0;
    let intro = motion.matches ? 1 : 0;
    const trail: InputPoint[] = [];
    const clicks: InputPoint[] = [];
    const trailData = new Float32Array(24 * 4);
    const clickData = new Float32Array(4 * 4);

    const markMotion = (running: boolean) => {
      const value = running ? "running" : "paused";
      host.dataset.motion = value;
      if (page) page.dataset.motion = value;
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = null;
      markMotion(false);
      host.style.setProperty("--pointer-opacity", "0");
    };
    const fail = () => {
      renderer?.dispose();
      renderer = null;
      sized = false;
      host.dataset.ready = "false";
    };
    const paint = () => {
      if (!renderer || !sized || disposed || lost) return;
      try {
        renderer.draw({
          time: elapsed, intro, seed: Math.floor(elapsed * 24) % 97,
          compact: compact.matches, still: motion.matches,
          trail: trailData, clicks: clickData,
        });
        host.dataset.ready = "true";
      } catch { fail(); }
    };
    const syncTheme = () => {
      const style = getComputedStyle(document.documentElement);
      const light = !document.documentElement.classList.contains("dark");
      const tokens = light
        ? ["--page", "--border", "--secondary-ink", "--foreground"]
        : ["--page", "--border", "--muted-ink", "--foreground"];
      const palette = tokens.map((token) => {
        const channels = style.getPropertyValue(token).trim().split(/\s+/).map(Number);
        return [channels[0] / 255, channels[1] / 255, channels[2] / 255] as const;
      });
      renderer?.theme(light, palette);
      paint();
    };
    const resize = () => {
      if (!renderer || disposed || lost) return;
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const budget = compact.matches ? 350_000 : 900_000;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(budget / (width * height)));
      try {
        renderer.resize(width, height, ratio);
        sized = true;
        paint();
      } catch { fail(); }
    };
    const scheduleResize = () => {
      if (!resizeFrame) resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        resize();
      });
    };
    const updateInput = (delta: number) => {
      trailData.fill(0);
      clickData.fill(0);
      for (const [list, lifetime] of [[trail, 0.7], [clicks, 1.2]] as const) {
        list.forEach((point) => { point.age += delta; });
        while (list.length && list[list.length - 1].age > lifetime) list.pop();
      }
      trail.forEach((point, index) => trailData.set([point.x, point.y, (1 - point.age / 0.7) ** 2, 0], index * 4));
      clicks.forEach((point, index) => {
        const envelope = Math.min(1, point.age / 0.08) * (1 - point.age / 1.2) ** 2;
        clickData.set([point.x, point.y, point.age, envelope], index * 4);
      });
    };
    const tick = (now: number) => {
      frame = 0;
      if (disposed || !visible || document.hidden || motion.matches || lost || !renderer) return;
      const delta = previous === null ? 0 : Math.min((now - previous) / 1000, 0.05);
      previous = now;
      elapsed += delta;
      intro = Math.min(1, intro + delta / 2.4);
      updateInput(delta);
      const interval = 1000 / (compact.matches ? 24 : 30);
      if (now - lastRender >= interval) {
        paint();
        lastRender = now - ((now - lastRender) % interval);
      }
      if (renderer) frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (disposed || !visible || document.hidden || motion.matches) return;
      markMotion(true);
      if (frame || !renderer || lost) return;
      previous = null;
      lastRender = 0;
      frame = requestAnimationFrame(tick);
    };
    const initialize = () => {
      try { renderer = createAsciiRenderer(canvas); }
      catch { renderer = null; }
      syncTheme();
      resize();
      start();
    };
    const onMotion = () => {
      if (motion.matches) {
        stop();
        intro = 1;
        trail.length = clicks.length = 0;
        updateInput(0);
        paint();
      } else start();
    };
    const locate = (event: PointerEvent): InputPoint | null => {
      const rect = host.getBoundingClientRect();
      const x = (event.clientX - rect.left) / Math.max(1, rect.width);
      const y = 1 - (event.clientY - rect.top) / Math.max(1, rect.height);
      if (x < 0 || x > 1 || y < 0 || y > 1) return null;
      return { x: (x - 0.5) * rect.width / Math.max(1, rect.height), y: y - 0.5, age: 0 };
    };
    const canInteract = () => visible && !document.hidden && !motion.matches;
    const onMove = (event: PointerEvent) => {
      if (!fine.matches || event.pointerType === "touch" || !canInteract()) return;
      const point = locate(event);
      if (!point) return;
      host.style.setProperty("--pointer-x", `${point.x * host.clientHeight + host.clientWidth / 2}px`);
      host.style.setProperty("--pointer-y", `${(0.5 - point.y) * host.clientHeight}px`);
      host.style.setProperty("--pointer-opacity", "1");
      if (!renderer) return;
      const previousPoint = trail[0];
      if (previousPoint && Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) < 0.015) return;
      trail.unshift(point);
      trail.length = Math.min(24, trail.length);
    };
    const onDown = (event: PointerEvent) => {
      if (!renderer || !canInteract() || (event.target instanceof Element && event.target.closest("a,button,input,select,textarea"))) return;
      const point = locate(event);
      if (point) {
        clicks.unshift(point);
        if (clicks.length > 4) clicks.pop();
      }
    };
    const onOut = (event: PointerEvent) => {
      if (!event.relatedTarget) host.style.setProperty("--pointer-opacity", "0");
    };
    const onVisibility = () => document.hidden ? stop() : start();
    const onLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      stop();
      fail();
      start();
    };
    const onRestored = () => {
      lost = false;
      initialize();
    };
    const resizeObserver = new ResizeObserver(scheduleResize);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    const themeObserver = new MutationObserver(syncTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    resizeObserver.observe(host);
    intersection.observe(host);
    motion.addEventListener("change", onMotion);
    compact.addEventListener("change", scheduleResize);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerout", onOut, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    initialize();
    onMotion();

    return () => {
      disposed = true;
      stop();
      cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      intersection.disconnect();
      themeObserver.disconnect();
      motion.removeEventListener("change", onMotion);
      compact.removeEventListener("change", scheduleResize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerout", onOut);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      renderer?.dispose();
    };
  }, []);

  return (
    <div ref={hostRef} className="login-atmosphere" aria-hidden="true" data-motion="paused">
      <pre className="login-ascii-fallback">{fallback}</pre>
      <canvas ref={canvasRef} className="login-ascii-canvas" />
      <div className="login-pointer-glow" />
      <div className="login-atmosphere-shade" />
    </div>
  );
}

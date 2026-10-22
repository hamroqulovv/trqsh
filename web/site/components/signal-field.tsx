"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import {
  ambientPackets, clamp, cycle, demoFrame, initialTime, lanes, layouts,
  packetLabelPosition, packetOnRoute, routeCurves, routePath, scenarios,
} from "./signal-geometry";
import { SignalScene } from "./signal-scene";

type Controller = { select: (index: number) => void; toggle: () => void };
const initial = demoFrame(initialTime);

export function SignalField({ publicHost }: { publicHost: string }) {
  const hostRef = useRef<HTMLElement>(null);
  const controllerRef = useRef<Controller | null>(null);
  const unique = useId().replace(/:/g, "");
  const [activeBranch, setActiveBranch] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const section = host.closest("section") ?? host;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const small = window.matchMedia("(max-width: 639px)");
    const fine = window.matchMedia("(pointer: fine)");
    const caption = host.querySelector<HTMLElement>("[data-caption]");
    const stepElements = Array.from(host.querySelectorAll<HTMLElement>("[data-flow-step]"), (element) => ({
      element, progress: element.querySelector<HTMLElement>("[data-step-progress]"),
    }));
    const scenes = Array.from(host.querySelectorAll<SVGSVGElement>("[data-signal-scene]"), (svg) => {
      const name = svg.dataset.signalScene as "wide" | "compact";
      const parts = (selector: string) => Array.from(svg.querySelectorAll<SVGGElement>(selector), (element) => ({
        element, trails: element.querySelectorAll("path"), heads: element.querySelectorAll("circle"),
      }));
      return {
        layout: layouts[name],
        field: svg.querySelector<SVGGElement>("[data-field]"),
        grid: svg.querySelector<SVGGElement>("[data-grid]"),
        routes: svg.querySelectorAll<SVGPathElement>("[data-route]"),
        activeRoutes: svg.querySelectorAll<SVGPathElement>("[data-active-route]"),
        glows: svg.querySelectorAll<SVGPathElement>("[data-branch-glow]"),
        ambient: parts("[data-ambient]"),
        lead: parts("[data-lead]")[0],
        gradients: svg.querySelectorAll<SVGLinearGradientElement>("[data-trail-gradient]"),
        label: svg.querySelector<SVGGElement>("[data-packet-label]"),
        labelText: svg.querySelector<SVGTextElement>("[data-packet-label] text"),
        clients: svg.querySelectorAll<SVGGElement>("[data-client]"),
        clientPulses: svg.querySelectorAll<SVGCircleElement>("[data-client-pulse]"),
        originPulses: svg.querySelectorAll<SVGCircleElement>("[data-origin-pulse]"),
        orbit: svg.querySelector<SVGGElement>("[data-orbit]"),
        relayPulse: svg.querySelector<SVGCircleElement>("[data-relay-pulse]"),
        terminal: svg.querySelector<SVGPathElement>("[data-terminal]"),
        cursor: svg.querySelector<SVGPathElement>("[data-cursor]"),
        work: svg.querySelector<SVGGElement>("[data-work]"),
        bars: svg.querySelectorAll<SVGPathElement>("[data-work] path"),
      };
    });
    let scene = scenes.find((item) => item.layout.compact === small.matches)!;
    let frame = 0;
    let visible = false;
    let manualPaused = false;
    let lastTime: number | null = null;
    let lastRender = 0;
    let time = initialTime;
    let seed = 0;
    let targetX = 0;
    let targetY = 0;
    let pointerX = 0;
    let pointerY = 0;
    let lastBranch = -1;
    let lastCaption = "";

    const draw = () => {
      const state = demoFrame(time, seed);
      const { layout } = scene;
      if (state.branch !== lastBranch) {
        setActiveBranch(state.branch);
        lastBranch = state.branch;
      }
      const text = motion.matches
        ? "Requests reach your local app through a public URL. Its responses travel back to the caller."
        : state.caption;
      if (caption && text !== lastCaption) {
        caption.textContent = text;
        lastCaption = text;
      }
      stepElements.forEach(({ element, progress }, index) => {
        element.dataset.state = motion.matches ? "complete" : index < state.step ? "complete" : index === state.step ? "active" : "pending";
        if (progress) progress.style.transform = `scaleX(${motion.matches ? 1 : state.stepProgress[index]})`;
      });
      scene.field?.setAttribute("transform", `translate(${(pointerX * 9).toFixed(2)} ${(pointerY * 6).toFixed(2)})`);
      scene.grid?.setAttribute("transform", `translate(${(-pointerX * 4).toFixed(2)} ${(-pointerY * 3).toFixed(2)})`);
      scene.routes.forEach((element, index) => {
        element.setAttribute("d", routePath(routeCurves(index, time, layout)));
      });
      scene.activeRoutes.forEach((element, branch) => {
        const path = routePath(routeCurves(branch * lanes + 4, time, layout));
        element.setAttribute("d", path);
        element.setAttribute("opacity", branch === state.branch ? "0.4" : "0.035");
        element.setAttribute("stroke-dashoffset", (time * (state.responding ? -18 : 18)).toFixed(2));
        scene.glows[branch].setAttribute("d", path);
        scene.glows[branch].setAttribute("opacity", branch === state.branch ? "0.04" : "0");
      });

      const traces = ambientPackets.map((packet) => {
        const phase = cycle(time * packet.speed + packet.phase);
        const progress = packet.direction === 1 ? phase : 1 - phase;
        return {
          ...packetOnRoute(packet.route, time, layout, progress, packet.direction),
          opacity: clamp(phase * 10) * clamp((1 - phase) * 10) * (Math.floor(packet.route / lanes) === state.branch ? 0.32 : 0.14),
        };
      });
      const lead = packetOnRoute(state.branch * lanes + 4, time, layout, state.progress, state.responding ? 1 : -1, 0.12);
      const labelPosition = packetLabelPosition(lead.point, layout);
      const allTraces = [...traces, { ...lead, opacity: state.opacity }];
      [...scene.ambient, scene.lead].forEach(({ element, trails, heads }, index) => {
        const trace = allTraces[index];
        element.setAttribute("opacity", trace.opacity.toFixed(3));
        trails.forEach((trail) => trail.setAttribute("d", trace.trail));
        heads.forEach((head) => {
          head.setAttribute("cx", trace.point.x.toFixed(2));
          head.setAttribute("cy", trace.point.y.toFixed(2));
        });
        const gradient = scene.gradients[index];
        gradient.setAttribute("x1", trace.tail.x.toFixed(2));
        gradient.setAttribute("y1", trace.tail.y.toFixed(2));
        gradient.setAttribute("x2", trace.point.x.toFixed(2));
        gradient.setAttribute("y2", trace.point.y.toFixed(2));
      });
      const localDistance = Math.hypot(lead.point.x - layout.origin.x, lead.point.y - layout.origin.y);
      scene.label?.setAttribute("opacity", (state.opacity * clamp((localDistance - 50) / 38)).toFixed(3));
      scene.label?.setAttribute("transform", `translate(${labelPosition.x.toFixed(2)} ${labelPosition.y.toFixed(2)})`);
      if (scene.labelText && scene.labelText.textContent !== state.packetLabel) scene.labelText.textContent = state.packetLabel;

      scene.clients.forEach((client, index) => {
        client.setAttribute("opacity", index === state.branch ? "1" : "0.62");
        const calling = state.phase < 0.08;
        const age = calling ? state.phase / 0.08 : clamp((state.phase - 0.9) / 0.1);
        const pulse = scene.clientPulses[index];
        pulse.setAttribute("r", (23 + age * 27).toFixed(2));
        pulse.setAttribute("opacity", index === state.branch && (calling || state.phase >= 0.9) ? ((1 - age) * 0.6).toFixed(3) : "0.07");
      });
      scene.originPulses.forEach((pulse, index) => {
        const phase = cycle(time * 0.65 + index * 0.5);
        pulse.setAttribute("r", (30 + phase * 29).toFixed(2));
        pulse.setAttribute("opacity", ((1 - phase) ** 2 * (state.step === 1 ? 0.5 : 0.17)).toFixed(3));
      });
      const relayDistance = Math.hypot(lead.point.x - layout.relay.x, lead.point.y - layout.relay.y);
      const relayEnergy = Math.max(0, 1 - relayDistance / 90) * state.opacity;
      scene.relayPulse?.setAttribute("r", (27 + relayEnergy * 12).toFixed(2));
      scene.relayPulse?.setAttribute("opacity", (0.12 + relayEnergy * 0.55).toFixed(3));
      scene.orbit?.setAttribute("transform", `rotate(${(time * 24).toFixed(2)})`);
      scene.terminal?.setAttribute("opacity", state.step === 1 ? "0" : "1");
      scene.cursor?.setAttribute("opacity", state.step === 1 || cycle(time * 1.4) > 0.7 ? "0" : "1");
      scene.work?.setAttribute("opacity", state.step === 1 ? "1" : "0");
      scene.bars.forEach((bar, index) => {
        const height = 5 + (Math.sin(time * 10 + index * 1.4) * 0.5 + 0.5) * 15;
        bar.setAttribute("d", `M${index * 7 - 7} ${(-height / 2).toFixed(2)}v${height.toFixed(2)}`);
      });
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = null;
      host.dataset.running = "false";
    };
    const tick = (now: number) => {
      frame = 0;
      if (!visible || document.hidden || motion.matches || manualPaused) return;
      const delta = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      time += delta;
      const damping = 1 - Math.exp(-delta * 5);
      pointerX += (targetX - pointerX) * damping;
      pointerY += (targetY - pointerY) * damping;
      const interval = 1000 / (small.matches ? 30 : 60);
      if (now - lastRender >= interval) {
        draw();
        lastRender = now - ((now - lastRender) % interval);
      }
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (frame || !visible || document.hidden || motion.matches || manualPaused) return;
      lastTime = null;
      lastRender = 0;
      host.dataset.running = "true";
      frame = requestAnimationFrame(tick);
    };
    const resetPointer = () => { targetX = targetY = 0; };
    const onMotion = () => {
      setReducedMotion(motion.matches);
      if (motion.matches) {
        stop();
        pointerX = pointerY = targetX = targetY = 0;
        draw();
      } else {
        draw();
        start();
      }
    };
    const onLayout = () => {
      scene = scenes.find((item) => item.layout.compact === small.matches)!;
      pointerX = pointerY = targetX = targetY = 0;
      draw();
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    const onPointer = (event: Event) => {
      if (!fine.matches || small.matches || motion.matches || !visible || manualPaused) return;
      const pointer = event as PointerEvent;
      const rect = section.getBoundingClientRect();
      targetX = clamp((pointer.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
      targetY = clamp((pointer.clientY - rect.top) / rect.height * 2 - 1, -1, 1);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    controllerRef.current = {
      select(index) {
        seed = index;
        time = initialTime;
        lastTime = null;
        draw();
      },
      toggle() {
        manualPaused = !manualPaused;
        setPaused(manualPaused);
        if (manualPaused) stop();
        else start();
      },
    };
    onMotion();
    draw();
    observer.observe(host);
    motion.addEventListener("change", onMotion);
    small.addEventListener("change", onLayout);
    fine.addEventListener("change", resetPointer);
    document.addEventListener("visibilitychange", onVisibility);
    section.addEventListener("pointermove", onPointer, { passive: true });
    section.addEventListener("pointerleave", resetPointer);
    return () => {
      controllerRef.current = null;
      stop();
      observer.disconnect();
      motion.removeEventListener("change", onMotion);
      small.removeEventListener("change", onLayout);
      fine.removeEventListener("change", resetPointer);
      document.removeEventListener("visibilitychange", onVisibility);
      section.removeEventListener("pointermove", onPointer);
      section.removeEventListener("pointerleave", resetPointer);
    };
  }, []);

  return (
    <figure ref={hostRef} className="signal-field" aria-label="How trqsh connects your local app to the internet">
      <div className="signal-viewport">
        <SignalScene name="wide" prefix={`${unique}-wide`} publicHost={publicHost} />
        <SignalScene name="compact" prefix={`${unique}-compact`} publicHost={publicHost} />
      </div>
      <figcaption className="signal-caption">
        <div className="signal-toolbar">
          <div className="signal-examples" role="group" aria-label="Traffic example">
            {scenarios.map((scenario, index) => (
              <button
                key={scenario.label} type="button" aria-pressed={activeBranch === index}
                onClick={() => controllerRef.current?.select(index)}
              >{scenario.label}</button>
            ))}
          </div>
          <button
            type="button" className="signal-playback" disabled={reducedMotion}
            aria-label={reducedMotion ? "Reduced motion is enabled" : paused ? "Play animation" : "Pause animation"}
            aria-pressed={paused || reducedMotion}
            onClick={() => controllerRef.current?.toggle()}
          >
            {paused || reducedMotion ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          </button>
        </div>
        <ol className="signal-steps" aria-label="Request and response flow">
          {["Request arrives", "Your app handles it", "Response returns"].map((label, index) => (
            <li key={label} data-flow-step="" data-state={index === 0 ? "active" : "pending"}>
              <span className="signal-step-track"><span data-step-progress="" style={{ transform: `scaleX(${initial.stepProgress[index]})` }} /></span>
              <span className="signal-step-number">0{index + 1}</span> {label}
            </li>
          ))}
        </ol>
        <p className="signal-description" data-caption="">{initial.caption}</p>
        <span className="sr-only">
          Example connection: a public caller sends a request through your trqsh URL
          to localhost:3000. Your app processes it and sends a response back.
        </span>
      </figcaption>
    </figure>
  );
}

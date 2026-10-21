"use client";

import { useEffect, useRef, useState } from "react";
import type * as Three from "three";
import { cn } from "@/lib/utils";

const vertexShader = `void main() { gl_Position = vec4(position, 1.0); }`;

// The supplied monochrome tunnel shader, sized to the hero rather than the
// viewport. Resolution and point size both account for the drawing-buffer DPR.
const fragmentShader = `
uniform float iTime;
uniform vec3 iResolution;
uniform vec2 iCenter;
uniform vec2 iPointer;
uniform float iPointScale;
#define TAU 6.2831853071795865
#define SPEED 0.7
float sq(float x) { return x * x; }
vec2 AngRep(vec2 uv, float angle) {
  vec2 polar = vec2(atan(uv.y, uv.x), length(uv));
  polar.x = mod(polar.x + angle / 2.0, angle) - angle / 2.0;
  return polar.y * vec2(cos(polar.x), sin(polar.x));
}
vec2 TunnelPath(float x) {
  vec2 offs = vec2(
    0.2 * sin(TAU * x * 0.5) + 0.4 * sin(TAU * x * 0.2 + 0.3),
    0.3 * cos(TAU * x * 0.3) + 0.2 * cos(TAU * x * 0.1)
  );
  return offs * smoothstep(1.0, 4.0, x);
}
void main() {
  vec2 res = iResolution.xy / iResolution.y;
  vec2 uv = gl_FragCoord.xy / iResolution.y - res * iCenter;
  uv += iPointer * 0.045;
  vec3 color = vec3(0.0);
  float repAngle = TAU / float(RING_POINTS);
  float pointSize = 1.8 * iPointScale / (2.0 * iResolution.y);
  float camZ = iTime * SPEED;
  vec2 camOffs = TunnelPath(camZ);
  for (int i = 1; i <= TUNNEL_LAYERS; i++) {
    float pz = 1.0 - float(i) / float(TUNNEL_LAYERS);
    pz -= mod(camZ, 4.0 / float(TUNNEL_LAYERS));
    vec2 offs = TunnelPath(camZ + pz) - camOffs;
    float ringRad = 0.15 / sq(pz * 0.8 + 0.4);
    if (abs(length(uv + offs) - ringRad) < pointSize * 1.5) {
      vec2 aruv = AngRep(uv + offs, repAngle);
      float pdist = length(aruv - vec2(ringRad, 0.0)) - pointSize;
      vec3 ptColor = mod(floor(float(i) / 2.0), 2.0) == 0.0 ? vec3(1.0) : vec3(0.7);
      color = mix(ptColor * (1.0 - pz), color, smoothstep(0.0, 1.0 / iResolution.y, pdist));
    }
  }
  gl_FragColor = vec4(color, 1.0);
}`;

const TAU = Math.PI * 2;
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};
// Mirrors TunnelPath in the shader, so the page can follow the vanishing
// point as the tunnel bends.
const tunnelPath = (x: number) => {
  const s = smoothstep(1, 4, x);
  return [
    (0.2 * Math.sin(TAU * x * 0.5) + 0.4 * Math.sin(TAU * x * 0.2 + 0.3)) * s,
    (0.3 * Math.cos(TAU * x * 0.3) + 0.2 * Math.cos(TAU * x * 0.1)) * s,
  ] as const;
};

export default function TunnelHero({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia("(max-width: 768px)");
    const stacked = window.matchMedia("(max-width: 1023px)");
    const fine = window.matchMedia("(pointer: fine)");
    const pointerTarget = host.closest("section") ?? host;
    let renderer: Three.WebGLRenderer | undefined;
    let scene: Three.Scene | undefined;
    let camera: Three.OrthographicCamera | undefined;
    let geometry: Three.PlaneGeometry | undefined;
    let material: Three.ShaderMaterial | undefined;
    const lifecycle = new AbortController();
    let initializing = false;
    let lost = false;
    let visible = true;
    let frame = 0;
    let resizeFrame = 0;
    let lastTime: number | null = null;
    let lastRender = 0;
    let pointerX = 0;
    let pointerY = 0;
    let cssHeight = 1;
    // Where the visible mouth of the tunnel sits relative to the hero center,
    // published as --vx/--vy on the backdrop for elements that should emerge
    // from it. Rings fade with depth, so the mouth is drawn by rings around
    // pz = 0.6 rather than by the (invisible) farthest ones.
    const backdrop = host.parentElement;
    const publishVanishingPoint = () => {
      if (!material || !backdrop) return;
      const camZ = material.uniforms.iTime.value * 0.7;
      const far = tunnelPath(camZ + 0.6);
      const near = tunnelPath(camZ);
      const pointer = material.uniforms.iPointer.value as Three.Vector2;
      const x = -(far[0] - near[0]) - pointer.x * 0.045;
      const y = -(far[1] - near[1]) - pointer.y * 0.045;
      backdrop.style.setProperty("--vx", `${(x * cssHeight).toFixed(1)}px`);
      backdrop.style.setProperty("--vy", `${(-y * cssHeight).toFixed(1)}px`);
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = null;
    };
    const render = () => {
      if (renderer && scene && camera && !lost) renderer.render(scene, camera);
    };
    const loop = (now: number) => {
      frame = 0;
      if (
        lifecycle.signal.aborted ||
        lost ||
        !visible ||
        document.hidden ||
        motion.matches ||
        !material
      )
        return;
      // Keep timestamps in milliseconds, including across visibility changes.
      const delta =
        lastTime === null ? 0 : Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      material.uniforms.iTime.value += delta * 0.5;
      const pointer = material.uniforms.iPointer.value as Three.Vector2;
      pointer.x += (pointerX - pointer.x) * 0.05;
      pointer.y += (pointerY - pointer.y) * 0.05;
      if (now - lastRender >= 1000 / (mobile.matches ? 24 : 30)) {
        render();
        publishVanishingPoint();
        lastRender = now;
      }
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      if (
        !frame &&
        material &&
        !lifecycle.signal.aborted &&
        !lost &&
        visible &&
        !document.hidden &&
        !motion.matches
      ) {
        lastTime = null;
        frame = requestAnimationFrame(loop);
      }
    };
    const resize = () => {
      if (!renderer || !material || lifecycle.signal.aborted) return;
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      const pixelBudget = mobile.matches ? 240_000 : 700_000;
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        mobile.matches ? 1 : 1.25,
        Math.sqrt(pixelBudget / (width * height)),
      );
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      const resolution = material.uniforms.iResolution.value as Three.Vector3;
      resolution.set(canvas.width, canvas.height, 1);
      cssHeight = height;
      (material.uniforms.iCenter.value as Three.Vector2).set(
        stacked.matches ? 0.5 : 0.75,
        stacked.matches ? 0.25 : 0.5,
      );
      material.uniforms.iPointScale.value = dpr;
      material.defines.TUNNEL_LAYERS = mobile.matches ? 48 : 96;
      material.defines.RING_POINTS = mobile.matches ? 80 : 128;
      material.needsUpdate = true;
      render();
    };
    const scheduleResize = () => {
      if (!resizeFrame)
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = 0;
          resize();
        });
    };
    const initialize = async () => {
      if (renderer || initializing || lifecycle.signal.aborted || motion.matches) return;
      initializing = true;
      try {
        // Three.js is fetched after hydration; text and navigation render first.
        const THREE = await import("three");
        if (lifecycle.signal.aborted || motion.matches) return;
        renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: false,
          powerPreference: "low-power",
        });
        scene = new THREE.Scene();
        camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        material = new THREE.ShaderMaterial({
          defines: {
            TUNNEL_LAYERS: mobile.matches ? 48 : 96,
            RING_POINTS: mobile.matches ? 80 : 128,
          },
          uniforms: {
            iTime: { value: 0 },
            iResolution: { value: new THREE.Vector3(1, 1, 1) },
            iCenter: { value: new THREE.Vector2(0.75, 0.5) },
            iPointer: { value: new THREE.Vector2() },
            iPointScale: { value: 1 },
          },
          vertexShader,
          fragmentShader,
          depthTest: false,
          depthWrite: false,
        });
        geometry = new THREE.PlaneGeometry(2, 2);
        scene.add(new THREE.Mesh(geometry, material));
        resize();
        setReady(true);
        start();
      } catch {
        // Keep the plain theme background if WebGL cannot initialize.
        stop();
        renderer?.dispose();
        renderer = undefined;
        material?.dispose();
        geometry?.dispose();
        material = undefined;
        geometry = undefined;
        scene = undefined;
        camera = undefined;
        setReady(false);
      } finally {
        initializing = false;
      }
    };
    const syncMotion = () => {
      if (motion.matches) {
        stop();
        render();
      } else {
        void initialize();
        start();
      }
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    const onPointer = (event: Event) => {
      if (!fine.matches || mobile.matches || motion.matches) return;
      const pointer = event as PointerEvent;
      const rect = host.getBoundingClientRect();
      pointerX = Math.max(
        -1,
        Math.min(1, ((pointer.clientX - rect.left) / rect.width) * 2 - 1),
      );
      pointerY = Math.max(
        -1,
        Math.min(1, ((pointer.clientY - rect.top) / rect.height) * 2 - 1),
      );
    };
    const resetPointer = () => {
      pointerX = 0;
      pointerY = 0;
    };
    const onLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      stop();
      setReady(false);
    };
    const onRestored = () => {
      lost = false;
      resize();
      setReady(true);
      start();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) {
        void initialize();
        start();
      } else stop();
    });
    const resizeObserver = new ResizeObserver(scheduleResize);
    observer.observe(host);
    resizeObserver.observe(host);
    motion.addEventListener("change", syncMotion);
    mobile.addEventListener("change", scheduleResize);
    stacked.addEventListener("change", scheduleResize);
    document.addEventListener("visibilitychange", onVisibility);
    pointerTarget.addEventListener("pointermove", onPointer, { passive: true });
    pointerTarget.addEventListener("pointerleave", resetPointer);
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    void initialize();

    return () => {
      lifecycle.abort();
      stop();
      cancelAnimationFrame(resizeFrame);
      observer.disconnect();
      resizeObserver.disconnect();
      motion.removeEventListener("change", syncMotion);
      mobile.removeEventListener("change", scheduleResize);
      stacked.removeEventListener("change", scheduleResize);
      document.removeEventListener("visibilitychange", onVisibility);
      pointerTarget.removeEventListener("pointermove", onPointer);
      pointerTarget.removeEventListener("pointerleave", resetPointer);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      geometry?.dispose();
      material?.dispose();
      renderer?.dispose();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={cn("hero-tunnel", ready && "hero-tunnel-ready", className)}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

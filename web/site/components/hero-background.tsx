import type { CSSProperties } from "react";
import TunnelHero from "@/components/ui/tunnel-hero";

// Requests that appear to fly out of the tunnel toward the viewer. Each one
// has its own heading (--dx/--dy) and slot in a shared loop (--i).
const signals = [
  { method: "GET", path: "/", status: "200", time: "12ms", dx: 230, dy: -190 },
  { method: "POST", path: "/webhooks/stripe", status: "200", time: "31ms", dx: -170, dy: 170 },
  { method: "GET", path: "/api/users", status: "200", time: "18ms", dx: 260, dy: 120 },
  { method: "WS", path: "/live", status: "101", time: "4ms", dx: -140, dy: -200 },
  { method: "POST", path: "/hooks/github", status: "202", time: "9ms", dx: 120, dy: 230 },
  { method: "GET", path: "/assets/app.js", status: "304", time: "3ms", dx: 300, dy: -30 },
];

// The hero keeps a plain, theme-matched background until WebGL is ready.
export function HeroBackground() {
  return (
    <div className="hero-backdrop" aria-hidden="true">
      <TunnelHero />
      <div className="hero-tunnel-shade" />
      <div className="hero-signals">
        {signals.map((signal, index) => (
          <span
            key={signal.path}
            className="hero-signal"
            style={
              {
                "--i": index,
                "--dx": `${signal.dx}px`,
                "--dy": `${signal.dy}px`,
              } as CSSProperties
            }
          >
            <span className="hero-signal-dot" />
            <span className="hero-signal-method">{signal.method}</span>
            <span className="hero-signal-path">{signal.path}</span>
            <span className="hero-signal-status">{signal.status}</span>
            <span className="hero-signal-time">{signal.time}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

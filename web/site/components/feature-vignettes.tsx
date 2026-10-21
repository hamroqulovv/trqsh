import type { CSSProperties } from "react";
import { Lock, MousePointer2 } from "lucide-react";
import { site } from "@/lib/site";

// Small, decorative product scenes for the capability cards. They are pure
// CSS loops (see components/home.css), pause until their card is revealed,
// and are hidden from assistive technology: the card text says it all.

const subdomains = ["tidy-otter", "brave-lynx", "calm-heron", "tidy-otter"];

function ShareScene() {
  return (
    <div className="vignette vignette-share" aria-hidden="true">
      <div className="vs-bar">
        <span className="vs-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="vs-url">
          <Lock className="h-2.5 w-2.5 shrink-0" strokeWidth={2} />
          <span className="vs-url-text">
            <span className="text-muted">https://</span>
            <span className="vs-slot">
              <span className="vs-slot-strip">
                {subdomains.map((name, index) => (
                  <span key={index}>{name}</span>
                ))}
              </span>
            </span>
            <span className="text-muted">.{site.tunnelDomain}</span>
          </span>
        </span>
      </div>
      <div className="vs-page">
        <span className="vs-live">
          <i />
          Live
        </span>
        <span className="vs-line" style={{ "--w": "62%", "--i": 0 } as CSSProperties} />
        <span className="vs-line" style={{ "--w": "84%", "--i": 1 } as CSSProperties} />
        <span className="vs-line" style={{ "--w": "45%", "--i": 2 } as CSSProperties} />
        <MousePointer2 className="vs-cursor" strokeWidth={1.5} />
      </div>
    </div>
  );
}

const events = [
  { path: "/webhooks/stripe", status: "200", time: "18ms" },
  { path: "/hooks/github", status: "202", time: "9ms" },
  { path: "/tg/update", status: "200", time: "22ms" },
];

function WebhookScene() {
  // The list repeats once so the ticker can loop without a visible seam.
  const rows = [...events, ...events];
  return (
    <div className="vignette vignette-hooks" aria-hidden="true">
      <div className="vh-head">
        <span>Inspector</span>
        <span className="vh-live">
          <i />
          listening
        </span>
      </div>
      <div className="vh-window">
        <span className="vh-flash" />
        <ul className="vh-list">
          {rows.map((event, index) => (
            <li key={index} className="vh-row">
              <span className="vh-method">POST</span>
              <span className="vh-path">{event.path}</span>
              <span className="vh-status">{event.status}</span>
              <span className="vh-time">{event.time}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const lanes = [
  { label: "TCP", port: ":22", kind: "stream" },
  { label: "UDP", port: ":51820", kind: "burst" },
  { label: "TLS", port: ":443", kind: "secure" },
];

function ProtocolScene() {
  return (
    <div className="vignette vignette-lanes" aria-hidden="true">
      {lanes.map((lane) => (
        <div key={lane.label} className={`vl-lane vl-${lane.kind}`}>
          <span className="vl-label">
            {lane.label}
            <span className="text-muted">{lane.port}</span>
          </span>
          <span className="vl-track">
            <span className="vl-end" />
            <i />
            <i />
            <i />
            {lane.kind === "secure" && (
              <Lock className="vl-lock" strokeWidth={2} />
            )}
            <span className="vl-end vl-end-remote" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function FeatureVignette({ kind }: { kind: "share" | "webhooks" | "protocols" }) {
  if (kind === "share") return <ShareScene />;
  if (kind === "webhooks") return <WebhookScene />;
  return <ProtocolScene />;
}

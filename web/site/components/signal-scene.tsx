import {
  ambientPackets, clamp, cycle, demoFrame, initialTime, lanes, layouts,
  packetLabelPosition, packetOnRoute, routeCurves, routePath, routes, scenarios,
} from "./signal-geometry";

function ClientGlyph({ index }: { index: number }) {
  if (index === 0) return <path d="M-9-7h18v14H-9zM-9-2H9" />;
  if (index === 1) return <path d="M0-5v7m-6 3 6-3 6 3M0-10a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M-6 5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M6 5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5" />;
  return <path d="m-4-7-6 7 6 7m8-14 6 7-6 7M1-9-1 9" />;
}

export function SignalScene({
  name, prefix, publicHost,
}: {
  name: "wide" | "compact";
  prefix: string;
  publicHost: string;
}) {
  const layout = layouts[name];
  const { origin, relay, compact, width, height, endpoints } = layout;
  const frame = demoFrame(initialTime);
  const particles = ambientPackets.map((packet) => {
    const phase = cycle(initialTime * packet.speed + packet.phase);
    return {
      ...packet,
      ...packetOnRoute(packet.route, initialTime, layout, packet.direction === 1 ? phase : 1 - phase, packet.direction),
      opacity: clamp(phase * 10) * clamp((1 - phase) * 10) * 0.25,
    };
  });
  const lead = packetOnRoute(frame.branch * lanes + 4, initialTime, layout, frame.progress, frame.responding ? 1 : -1, 0.12);
  const traces = [...particles, lead];
  const labelPosition = packetLabelPosition(lead.point, layout);

  return (
    <svg
      viewBox={compact ? `0 0 ${width} ${height}` : "0 50 960 550"} fill="none" focusable="false"
      aria-hidden="true" className={`signal-art signal-art-${name}`}
      data-signal-scene={name}
    >
      <defs>
        <pattern id={`${prefix}-grid`} width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.8" fill="currentColor" />
        </pattern>
        <radialGradient id={`${prefix}-fade`}>
          <stop offset="0" stopColor="white" stopOpacity="0.8" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id={`${prefix}-mask`}>
          <rect width={width} height={height} fill={`url(#${prefix}-fade)`} />
        </mask>
        {traces.map((trace, index) => (
          <linearGradient
            key={index} id={`${prefix}-trace-${index}`} data-trail-gradient=""
            gradientUnits="userSpaceOnUse"
            x1={trace.tail.x} y1={trace.tail.y} x2={trace.point.x} y2={trace.point.y}
          >
            <stop offset="0" stopColor="currentColor" stopOpacity="0" />
            <stop offset="0.8" stopColor="currentColor" stopOpacity="0.7" />
            <stop offset="1" stopColor="currentColor" />
          </linearGradient>
        ))}
      </defs>

      <g className="signal-grid" data-grid="" mask={`url(#${prefix}-mask)`}>
        <rect width={width} height={height} fill={`url(#${prefix}-grid)`} />
      </g>
      <g data-field="">
        <g className="signal-routes" stroke="currentColor" strokeWidth={compact ? 1 : 0.85}>
          {routes.map((route, index) => (
            <path key={index} data-route="" d={routePath(routeCurves(index, initialTime, layout))} opacity={route.opacity} />
          ))}
        </g>
        {scenarios.map((scenario, branch) => (
          <g key={scenario.label}>
            <path
              data-branch-glow="" d={routePath(routeCurves(branch * lanes + 4, initialTime, layout))}
              stroke="currentColor" strokeWidth="9" opacity={branch === frame.branch ? 0.035 : 0}
            />
            <path
              data-active-route="" d={routePath(routeCurves(branch * lanes + 4, initialTime, layout))}
              stroke="currentColor" strokeWidth="1.3" strokeDasharray="3 18"
              opacity={branch === frame.branch ? 0.34 : 0.04}
            />
          </g>
        ))}

        <g strokeLinecap="round">
          {particles.map((packet, index) => (
            <g key={index} data-ambient="" opacity={packet.opacity}>
              <path d={packet.trail} stroke={`url(#${prefix}-trace-${index})`} strokeWidth="1.5" />
              <circle cx={packet.point.x} cy={packet.point.y} r="2" fill="currentColor" />
            </g>
          ))}
          <g data-lead="" opacity={frame.opacity}>
            <path d={lead.trail} stroke={`url(#${prefix}-trace-6)`} strokeWidth="10" opacity="0.08" />
            <path d={lead.trail} stroke={`url(#${prefix}-trace-6)`} strokeWidth={compact ? 3 : 2.6} />
            <circle cx={lead.point.x} cy={lead.point.y} r="10" fill="currentColor" opacity="0.09" />
            <circle cx={lead.point.x} cy={lead.point.y} r="3.5" fill="currentColor" />
          </g>
        </g>

        <g transform={`translate(${origin.x} ${origin.y})`}>
          {[0, 1].map((index) => (
            <circle key={index} data-origin-pulse="" r={32 + index * 16} stroke="currentColor" strokeWidth="0.8" opacity="0.1" />
          ))}
          <rect x="-25" y="-25" width="50" height="50" rx="12" className="signal-node-shell signal-local-shell" />
          <path data-terminal="" d="m-9-7 7 7-7 7" opacity={frame.step === 1 ? 0 : 1} className="signal-glyph" />
          <path data-cursor="" d="M2 7h9" opacity={frame.step === 1 ? 0 : 1} className="signal-glyph" />
          <g data-work="" opacity={frame.step === 1 ? 1 : 0} className="signal-glyph">
            {[-7, 0, 7].map((x, index) => {
              const barHeight = 5 + (Math.sin(initialTime * 10 + index * 1.4) * 0.5 + 0.5) * 15;
              return <path key={x} d={`M${x} ${-barHeight / 2}v${barHeight}`} />;
            })}
          </g>
          <text
            x={compact ? -40 : 0} y={compact ? -4 : 66}
            textAnchor={compact ? "end" : "middle"} className="signal-node-title"
          >Your local app</text>
          <text
            x={compact ? -40 : 0} y={compact ? 20 : 90}
            textAnchor={compact ? "end" : "middle"} className="signal-node-detail"
          >localhost:3000</text>
        </g>

        <g transform={`translate(${relay.x} ${relay.y})`}>
          <g data-orbit="">
            <circle r="34" stroke="currentColor" strokeWidth="1" strokeDasharray="5 14" opacity="0.25" />
          </g>
          <circle data-relay-pulse="" r="27" stroke="currentColor" strokeWidth="1" opacity="0.15" />
          <circle r="22" className="signal-node-shell" />
          <path d="M-8-4H8m-4-4 4 4-4 4M8 6H-8m4-4-4 4 4 4" className="signal-glyph" />
          <text
            x={compact ? 44 : 0} y={compact ? -5 : -69}
            textAnchor={compact ? "start" : "middle"} className="signal-node-title"
          >Public URL</text>
          <text
            x={compact ? 44 : 0} y={compact ? 19 : -45}
            textAnchor={compact ? "start" : "middle"} className="signal-node-detail signal-public-url"
          >{publicHost}</text>
        </g>

        {endpoints.map((endpoint, index) => (
          <g key={index} data-client="" transform={`translate(${endpoint.x} ${endpoint.y})`} opacity={index === frame.branch ? 1 : 0.62}>
            <circle data-client-pulse="" r="24" stroke="currentColor" strokeWidth="1" opacity="0.12" />
            <circle r="20" className="signal-node-shell" />
            <g className="signal-glyph"><ClientGlyph index={index} /></g>
            <text
              x={compact ? 0 : 34} y={compact ? 44 : 0}
              textAnchor={compact ? "middle" : "start"} className="signal-node-title"
            >{scenarios[index].label}</text>
            <text
              x={compact ? 0 : 34} y={compact ? 68 : 24}
              textAnchor={compact ? "middle" : "start"} className="signal-node-detail"
            >{scenarios[index].request}</text>
          </g>
        ))}

        <g
          data-packet-label="" opacity={frame.opacity}
          transform={`translate(${labelPosition.x} ${labelPosition.y})`}
        >
          <rect x={compact ? -76 : -66} y="-17" width={compact ? 152 : 132} height="32" rx="6" className="signal-packet-shell" />
          <text y="4" textAnchor="middle" className="signal-packet-text">{frame.packetLabel}</text>
        </g>
      </g>
    </svg>
  );
}

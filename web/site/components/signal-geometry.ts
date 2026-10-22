export type Point = { x: number; y: number };
export type Curve = readonly [Point, Point, Point, Point];
export type SignalLayout = {
  compact: boolean;
  width: number;
  height: number;
  origin: Point;
  relay: Point;
  endpoints: readonly Point[];
};

export const layouts: Record<"wide" | "compact", SignalLayout> = {
  wide: {
    compact: false, width: 960, height: 650,
    origin: { x: 108, y: 320 }, relay: { x: 390, y: 320 },
    endpoints: [{ x: 770, y: 126 }, { x: 820, y: 320 }, { x: 770, y: 514 }],
  },
  compact: {
    compact: true, width: 560, height: 600,
    origin: { x: 280, y: 90 }, relay: { x: 280, y: 260 },
    endpoints: [{ x: 88, y: 456 }, { x: 280, y: 512 }, { x: 472, y: 456 }],
  },
};

export const scenarios = [
  { label: "Browser", request: "GET /", response: "200 OK", detail: "Open your app", actor: "browser" },
  { label: "Webhooks", request: "POST /hooks", response: "202 Accepted", detail: "Receive an event", actor: "webhook sender" },
  { label: "API client", request: "GET /api", response: "200 OK", detail: "Call your API", actor: "API client" },
] as const;

export const lanes = 9;
export const routes = scenarios.flatMap((_, branch) =>
  Array.from({ length: lanes }, (_, lane) => ({
    branch,
    spread: lane - (lanes - 1) / 2,
    opacity: 0.07 + (1 - Math.abs(lane - 4) / 5) * 0.12,
  })),
);
export const ambientPackets = scenarios.flatMap((_, branch) => [
  { route: branch * lanes + 2, direction: 1, speed: 0.16, phase: branch * 0.21 },
  { route: branch * lanes + 6, direction: -1, speed: 0.14, phase: branch * 0.23 + 0.5 },
]);

export const cycle = (value: number) => ((value % 1) + 1) % 1;
export const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
export const initialTime = 2.2;
export const duration = 9.6;

export function packetLabelPosition(point: Point, layout: SignalLayout) {
  const { relay, compact } = layout;
  const influence = Math.exp(-(((compact ? point.y - relay.y : point.x - relay.x) / (compact ? 110 : 140)) ** 2));
  return {
    x: clamp(point.x - (compact ? influence * 110 : 0), 82, layout.width - 82),
    y: point.y - 29 + (compact ? 0 : influence * 82),
  };
}

// One coherent round trip: public caller → relay → local app → caller.
export function demoFrame(time: number, seed = 0) {
  const phase = cycle(time / duration);
  const branch = (Math.floor(time / duration) + seed) % scenarios.length;
  const step = phase < 0.4 ? 0 : phase < 0.58 ? 1 : 2;
  const responding = phase >= 0.58;
  const travel = responding ? (phase - 0.58) / 0.32 : (phase - 0.08) / 0.32;
  const progress = responding ? clamp(travel) : 1 - clamp(travel);
  const opacity = clamp(travel * 12) * clamp((1 - travel) * 12);
  const scenario = scenarios[branch];
  const caption = step === 0
    ? `${scenario.request} reaches your local app through its public URL.`
    : step === 1
      ? "Your app handles the request on localhost:3000."
      : `${scenario.response} returns to the ${scenario.actor} over the same connection.`;
  return {
    phase, branch, step, progress, opacity, responding, caption,
    packetLabel: responding ? scenario.response : scenario.request,
    stepProgress: [clamp(phase / 0.4), clamp((phase - 0.4) / 0.18), clamp((phase - 0.58) / 0.42)],
  };
}

export function routeCurves(index: number, time: number, layout: SignalLayout): readonly [Curve, Curve] {
  const { branch, spread } = routes[index];
  const { origin, relay, endpoints, compact } = layout;
  const end = endpoints[branch];
  const wave = Math.sin(time * 0.7 + branch * 1.2) * 11;
  const sway = Math.cos(time * 0.45 + branch * 0.7) * 8;
  if (compact) {
    const joint = { x: relay.x + spread * 0.4, y: relay.y };
    return [
      [
        { x: origin.x + spread * 0.4, y: origin.y + 25 },
        { x: origin.x + spread * 4 + wave * 0.3, y: origin.y + 78 },
        { x: relay.x + spread * 4 - wave * 0.3, y: relay.y - 70 },
        joint,
      ],
      [
        joint,
        { x: relay.x + spread * 10 + wave, y: relay.y + 112 + sway },
        { x: end.x + spread * 7 - wave, y: end.y - 76 },
        end,
      ],
    ];
  }
  const joint = { x: relay.x, y: relay.y + spread * 0.4 };
  return [
    [
      { x: origin.x + 25, y: origin.y + spread * 0.4 },
      { x: origin.x + 108, y: origin.y + spread * 4 + wave * 0.3 },
      { x: relay.x - 96, y: relay.y + spread * 4 - wave * 0.3 },
      joint,
    ],
    [
      joint,
      { x: relay.x + 132 + sway, y: relay.y + spread * 11 + wave },
      { x: end.x - 145 + sway, y: end.y + spread * 8 - wave },
      end,
    ],
  ];
}

const xy = (point: Point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
export function routePath(curves: readonly Curve[]) {
  return curves.map(([start, control1, control2, end]) =>
    `M${xy(start)} C${xy(control1)} ${xy(control2)} ${xy(end)}`,
  ).join(" ");
}

function pointOnCurve([a, b, c, d]: Curve, t: number): Point {
  const s = 1 - t;
  return {
    x: s ** 3 * a.x + 3 * s ** 2 * t * b.x + 3 * s * t ** 2 * c.x + t ** 3 * d.x,
    y: s ** 3 * a.y + 3 * s ** 2 * t * b.y + 3 * s * t ** 2 * c.y + t ** 3 * d.y,
  };
}

// Build one distance table per packet, shared by its head and fading tail.
export function packetOnRoute(
  route: number, time: number, layout: SignalLayout,
  progress: number, direction: number, tailLength = 0.075,
) {
  const curves = routeCurves(route, time, layout);
  const samples = [{ ...curves[0][0], distance: 0 }];
  const steps = 24;
  for (const curve of curves) {
    for (let step = 1; step <= steps; step++) {
      const point = pointOnCurve(curve, step / steps);
      const previous = samples[samples.length - 1];
      samples.push({ ...point, distance: previous.distance + Math.hypot(point.x - previous.x, point.y - previous.y) });
    }
  }
  const total = samples[samples.length - 1].distance;
  const at = (value: number): Point => {
    const distance = clamp(value) * total;
    let index = 1;
    while (index < samples.length - 1 && samples[index].distance < distance) index++;
    const a = samples[index - 1];
    const b = samples[index];
    const fraction = (distance - a.distance) / (b.distance - a.distance || 1);
    return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
  };
  const point = at(progress);
  const trail = Array.from({ length: 12 }, (_, index) => {
    const tail = progress - direction * (1 - index / 11) * tailLength;
    return `${index === 0 ? "M" : "L"}${xy(at(tail))}`;
  }).join(" ");
  return { point, trail, tail: at(progress - direction * tailLength) };
}

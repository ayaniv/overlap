export const CENTER = 500;
export const INNER_RING_RADIUS = 160;
// fixed radial gap between adjacent rings, so existing rings never rescale —
// adding a location grows the whole face outward by one step, removing one
// shrinks it back, instead of squeezing every ring into a fixed band (M2 notice)
export const RING_RADIUS_STEP = 58;
export const LABEL_RADIUS_OFFSET = 16;
export const LABEL_ARC_HALF_SPAN_DEG = 63;
// gap between the outermost ring and the tick bezel, and between the bezel and
// the strike's top end — both tracked from the outermost ring so they grow/
// shrink with it rather than sitting at a fixed radius (M2 notice)
export const BEZEL_MARGIN = 54;
export const BEZEL_TICK_COUNT = 60;
export const BEZEL_MAJOR_TICK_EVERY = 5;
export const STRIKE_TOP_MARGIN = 10;
// lands exactly on the top of the NOW capsule (measured at viewBox y≈370) so the
// strike connects into the NOW marker
export const STRIKE_BOTTOM_Y = 370;
export const DEGREES_PER_HOUR = 15;
export const DEGREES_PER_TICK = 6;

export type Point = { x: number; y: number };

const toRad = (deg: number) => (deg * Math.PI) / 180;

// angle 0 = straight up (12 o'clock), increasing clockwise
export function pointOnCircle(radius: number, angleDeg: number): Point {
  const a = toRad(angleDeg);
  return { x: CENTER + radius * Math.sin(a), y: CENTER - radius * Math.cos(a) };
}

// ring radii grow outward from the fixed home radius by a constant step: home
// (the last index) always sits at INNER_RING_RADIUS, and each ring further
// from home sits exactly one more step out, regardless of ring count
export function ringRadius(indexFromOuter: number, totalRings: number): number {
  return INNER_RING_RADIUS + (totalRings - 1 - indexFromOuter) * RING_RADIUS_STEP;
}

export function outermostRingRadius(totalRings: number): number {
  return ringRadius(0, totalRings);
}

export function bezelBaseRadius(totalRings: number): number {
  return outermostRingRadius(totalRings) + BEZEL_MARGIN;
}

export function strikeTopRadius(totalRings: number): number {
  return bezelBaseRadius(totalRings) + STRIKE_TOP_MARGIN;
}

// arc from workStart to workEnd, rotated so the city's current time sits at the top axis
export function workingHoursArcPath(radius: number, currentFrac: number, workStart: number, workEnd: number): string {
  const startAngle = (currentFrac - workStart) * DEGREES_PER_HOUR;
  const endAngle = (currentFrac - workEnd) * DEGREES_PER_HOUR;
  const start = pointOnCircle(radius, startAngle);
  const end = pointOnCircle(radius, endAngle);
  return `M${start.x.toFixed(2)},${start.y.toFixed(2)} A${radius},${radius} 0 0 0 ${end.x.toFixed(2)},${end.y.toFixed(2)}`;
}

// invisible arc a curved <textPath> label rides along
export function labelArcPath(radius: number): string {
  const start = pointOnCircle(radius, -LABEL_ARC_HALF_SPAN_DEG);
  const end = pointOnCircle(radius, LABEL_ARC_HALF_SPAN_DEG);
  return `M${start.x.toFixed(2)},${start.y.toFixed(2)} A${radius},${radius} 0 0 1 ${end.x.toFixed(2)},${end.y.toFixed(2)}`;
}

export type BezelTick = { x1: number; y1: number; x2: number; y2: number; stroke: string; width: number };

// bezel ticks ring the clock at `baseRadius` (from bezelBaseRadius), so they
// grow/shrink outward together with the ring stack (M2 notice)
export function bezelTicks(baseRadius: number): BezelTick[] {
  const ticks: BezelTick[] = [];
  for (let k = 0; k < BEZEL_TICK_COUNT; k++) {
    const angle = k * DEGREES_PER_TICK;
    const isMajor = k % BEZEL_MAJOR_TICK_EVERY === 0;
    const length = isMajor ? 12 : 6;
    const inner = pointOnCircle(baseRadius, angle);
    const outer = pointOnCircle(baseRadius + length, angle);
    ticks.push({
      x1: inner.x,
      y1: inner.y,
      x2: outer.x,
      y2: outer.y,
      stroke: isMajor ? '#6B7079' : '#3D414A',
      width: isMajor ? 2.4 : 1.6,
    });
  }
  return ticks;
}

// one full clockwise turn per minute
export function handAngle(now: Date): number {
  return ((now.getTime() % 60000) / 60000) * 360;
}

export function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// direction chevrons: a radial column at 9 o'clock, one per gap between rings,
// all pointing clockwise to emphasize the sweep direction
export const CHEVRON_ANGLE = 270;

export type Chevron = { angle: number; points: string; opacity: number };

// one chevron at the midpoint of every gap between adjacent rings, so the
// count always matches the actual number of rings (not a fixed 4) — visible
// only in between rings, never floating past the outermost or inside home
// (M2 notice); `ringRadii` must be sorted outer -> inner
export function directionChevrons(ringRadii: number[]): Chevron[] {
  const gapRadii: number[] = [];
  for (let i = 0; i < ringRadii.length - 1; i++) {
    gapRadii.push((ringRadii[i] + ringRadii[i + 1]) / 2);
  }
  return gapRadii.map((radius) => {
    const y = CENTER - radius;
    // right-pointing ">" (apex at x=505) becomes clockwise once the group is rotated to 270°
    return { angle: CHEVRON_ANGLE, opacity: 0.6, points: `493,${y - 8} 505,${y} 493,${y + 8}` };
  });
}

// angle of a meeting marker relative to the top (NOW) axis: elapsed hours between
// now and the meeting instant is timezone-independent, so the same angle applies
// to every ring
export function meetingAngle(meetingInstant: Date, now: Date): number {
  const hoursDelta = (meetingInstant.getTime() - now.getTime()) / (1000 * 60 * 60);
  return hoursDelta * DEGREES_PER_HOUR;
}

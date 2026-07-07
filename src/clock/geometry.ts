export const CENTER = 500;
export const INNER_RING_RADIUS = 160;
// fixed radial gap between adjacent rings, so existing rings never rescale —
// adding a location grows the whole face outward by one step, removing one
// shrinks it back
export const RING_RADIUS_STEP = 58;
export const LABEL_RADIUS_OFFSET = 16;
export const LABEL_ARC_HALF_SPAN_DEG = 63;
// gap between the outermost ring and the tick bezel, and between the bezel and
// the strike's top end — both tracked from the outermost ring so they grow/
// shrink with it
export const BEZEL_MARGIN = 54;
export const BEZEL_TICK_COUNT = 60;
export const BEZEL_MAJOR_TICK_EVERY = 5;
export const STRIKE_TOP_MARGIN = 10;
// lands exactly on the top of the NOW capsule (measured at viewBox y≈370) so the
// strike connects into the NOW marker
export const STRIKE_BOTTOM_Y = 370;
export const DEGREES_PER_HOUR = 15;
export const DEGREES_PER_TICK = 6;
export const MS_PER_HOUR = 3_600_000;

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
// grow/shrink outward together with the ring stack
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
// count always matches the actual number of rings — visible only in between
// rings, never floating past the outermost or inside home; `ringRadii` must
// be sorted outer -> inner
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

// a Meeting.startISO of unknown provenance (share link, localStorage) may not be
// a valid ISO string; returns null instead of an Invalid Date so callers can skip
// and log rather than silently rendering a NaN-positioned dot
export function parseMeetingInstant(startISO: string): Date | null {
  const instant = new Date(startISO);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

// angle (same convention as pointOnCircle: 0 = up, clockwise positive, in [0,360)) of a
// point expressed as a pixel offset from a center — scale-invariant, so a drag handler
// can pass raw pointer-to-center deltas without converting to viewBox units
export function angleFromCenterOffset(dx: number, dy: number): number {
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

// shortest signed delta from one angle to another, in (-180, 180], so a drag that
// crosses the 0/360 seam doesn't jump to the long way around
export function angleDelta(fromDeg: number, toDeg: number): number {
  let delta = (toDeg - fromDeg) % 360;
  if (delta > 180) delta -= 360;
  if (delta <= -180) delta += 360;
  return delta;
}

// converts a rotation (degrees, at DEGREES_PER_HOUR) into a time offset in milliseconds
export function offsetMsFromAngle(deltaDeg: number): number {
  return (deltaDeg / DEGREES_PER_HOUR) * MS_PER_HOUR;
}

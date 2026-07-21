export const CENTER = 500;
export const INNER_RING_RADIUS = 160;
// fixed radial gap between adjacent rings, so existing rings never rescale —
// adding a location grows the whole face outward by one step, removing one
// shrinks it back
export const RING_RADIUS_STEP = 58;
export const LABEL_RADIUS_OFFSET = 16;
export const LABEL_ARC_HALF_SPAN_DEG = 63;
// gap between the outermost ring and the tick bezel, and between the bezel and
// the triangle marker's outer edge — both tracked from the outermost ring so
// they grow/shrink with it
export const BEZEL_MARGIN = 54;
export const BEZEL_TICK_COUNT = 60;
export const BEZEL_MAJOR_TICK_EVERY = 5;
export const DEGREES_PER_HOUR = 15;
export const DEGREES_PER_TICK = 6;
export const MS_PER_HOUR = 3_600_000;
export const TOP_MARKER_TOP_MARGIN = 20;
export const TOP_MARKER_HALF_WIDTH = 12;
// the fast minute-sweep hand rides just outside the tick bezel; margins are
// relative to bezelBaseRadius(totalRings) so it tracks the bezel as the ring
// stack grows/shrinks, instead of floating at a fixed radius
export const SWEEP_HAND_INNER_MARGIN = -8;
export const SWEEP_HAND_OUTER_MARGIN = 14;
export const SWEEP_HAND_DOT_MARGIN = 16;

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

export function sweepHandInnerRadius(totalRings: number): number {
  return bezelBaseRadius(totalRings) + SWEEP_HAND_INNER_MARGIN;
}

export function sweepHandOuterRadius(totalRings: number): number {
  return bezelBaseRadius(totalRings) + SWEEP_HAND_OUTER_MARGIN;
}

export function sweepHandDotRadius(totalRings: number): number {
  return bezelBaseRadius(totalRings) + SWEEP_HAND_DOT_MARGIN;
}

export function topMarkerOuterRadius(totalRings: number): number {
  return bezelBaseRadius(totalRings) + TOP_MARKER_TOP_MARGIN;
}

// height of an equilateral triangle = base * sqrt(3)/2, so the apex radius is
// derived from the base width rather than picked independently
export function topMarkerInnerRadius(totalRings: number): number {
  return topMarkerOuterRadius(totalRings) - TOP_MARKER_HALF_WIDTH * Math.sqrt(3);
}

// the triangle's apex y — shared so callers (the polygon itself, the fading guide
// line) can't drift apart if the marker geometry changes again
export function topMarkerApexY(totalRings: number): number {
  return CENTER - topMarkerInnerRadius(totalRings);
}

// arc from workStart to workEnd, rotated so the city's current time sits at the top axis
export function workingHoursArcPath(radius: number, currentFrac: number, workStart: number, workEnd: number): string {
  const startAngle = (currentFrac - workStart) * DEGREES_PER_HOUR;
  const endAngle = (currentFrac - workEnd) * DEGREES_PER_HOUR;
  const start = pointOnCircle(radius, startAngle);
  const end = pointOnCircle(radius, endAngle);
  // the two endpoints alone are ambiguous between two same-radius circles (this
  // ring's true center and its mirror across the start/end chord); a hardcoded
  // large-arc-flag of 0 only happens to resolve to the true center for spans
  // <=180°, so spans >180° must flip it to stay on the correct circle instead of
  // bulging onto the mirrored one (sweep-flag stays 0 — same rotation direction
  // throughout, only which of the two candidate circles is used changes)
  const spanDeg = (workEnd - workStart) * DEGREES_PER_HOUR;
  const largeArcFlag = spanDeg > 180 ? 1 : 0;
  return `M${start.x.toFixed(2)},${start.y.toFixed(2)} A${radius},${radius} 0 ${largeArcFlag} 0 ${end.x.toFixed(2)},${end.y.toFixed(2)}`;
}

// invisible arc a curved <textPath> label rides along
export function labelArcPath(radius: number): string {
  const start = pointOnCircle(radius, -LABEL_ARC_HALF_SPAN_DEG);
  const end = pointOnCircle(radius, LABEL_ARC_HALF_SPAN_DEG);
  return `M${start.x.toFixed(2)},${start.y.toFixed(2)} A${radius},${radius} 0 0 1 ${end.x.toFixed(2)},${end.y.toFixed(2)}`;
}

// arc length from the start of labelArcPath(radius) to its center (angle 0, where the
// ring's dot sits) — lets callers place text a fixed pixel distance from the dot via an
// absolute textPath startOffset, instead of a percentage (which is a different pixel
// distance on every ring, since arc length scales with radius)
export function labelArcHalfLength(radius: number): number {
  return (radius * LABEL_ARC_HALF_SPAN_DEG * Math.PI) / 180;
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

// filled triangle at 12 o'clock, apex pointing into the dial; the sole "now" marker,
// replacing bezel tick #0 (fixed at angle 0, so no need for pointOnCircle); grows/
// shrinks with the ring stack via topMarkerOuterRadius(totalRings)
export function topMarkerPoints(totalRings: number): string {
  const baseY = (CENTER - topMarkerOuterRadius(totalRings)).toFixed(2);
  const apexY = topMarkerApexY(totalRings).toFixed(2);
  return `${CENTER - TOP_MARKER_HALF_WIDTH},${baseY} ${CENTER + TOP_MARKER_HALF_WIDTH},${baseY} ${CENTER},${apexY}`;
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

// angle of a meeting marker relative to the top (NOW) axis, in the same
// (currentFrac - eventFrac) convention as workingHoursArcPath: a future meeting is
// negative (counterclockwise, hasn't swept up to NOW yet) and sweeps clockwise
// toward 0 as real time passes, landing exactly on the NOW axis when the meeting
// arrives, then continuing clockwise into positive (past) territory — sticky to the
// ring's own rotation, not an independent "distance from now" marker. Elapsed hours
// between now and the meeting instant is timezone-independent, so the same angle
// applies to every ring.
export function meetingAngle(meetingInstant: Date, now: Date): number {
  const hoursDelta = (now.getTime() - meetingInstant.getTime()) / MS_PER_HOUR;
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

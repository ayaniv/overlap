import { describe, expect, it } from 'vitest';
import {
  angleDelta,
  angleFromCenterOffset,
  bezelBaseRadius,
  bezelTicks,
  CENTER,
  DEGREES_PER_HOUR,
  directionChevrons,
  handAngle,
  hexToRgba,
  labelArcHalfLength,
  meetingAngle,
  offsetMsFromAngle,
  outermostRingRadius,
  parseMeetingInstant,
  pointOnCircle,
  type Point,
  ringRadius,
  sweepHandDotRadius,
  sweepHandInnerRadius,
  sweepHandOuterRadius,
  topMarkerInnerRadius,
  topMarkerOuterRadius,
  topMarkerPoints,
  workingHoursArcPath,
} from './geometry';

describe('pointOnCircle', () => {
  it('places angle 0 straight up from center', () => {
    const p = pointOnCircle(100, 0);
    expect(p.x).toBeCloseTo(500);
    expect(p.y).toBeCloseTo(400);
  });

  it('places angle 90 to the right of center', () => {
    const p = pointOnCircle(100, 90);
    expect(p.x).toBeCloseTo(600);
    expect(p.y).toBeCloseTo(500);
  });
});

describe('ringRadius', () => {
  it('reproduces the reference design radii for 5 rings', () => {
    const radii = [0, 1, 2, 3, 4].map((i) => ringRadius(i, 5));
    expect(radii).toEqual([392, 334, 276, 218, 160]);
  });

  it('keeps home (the last index) fixed at the inner radius regardless of ring count', () => {
    for (const totalRings of [1, 2, 3, 5, 8]) {
      expect(ringRadius(totalRings - 1, totalRings)).toBe(160);
    }
  });

  it('grows outward by a fixed step per ring, so existing rings shift by exactly one step when a ring is added', () => {
    const before = ringRadius(0, 4); // outermost of 4 rings
    const after = ringRadius(0, 5); // same ring (still index 0), one more ring added
    expect(after - before).toBe(58);
  });

  it('falls back to the inner radius for a single ring', () => {
    expect(ringRadius(0, 1)).toBe(160);
  });
});

describe('outermostRingRadius / bezelBaseRadius / topMarkerOuterRadius', () => {
  it('track the outermost ring radius as it grows', () => {
    expect(outermostRingRadius(5)).toBe(392);
    expect(outermostRingRadius(6)).toBe(450);
  });

  it('sit at a fixed margin beyond the outermost ring', () => {
    expect(bezelBaseRadius(5)).toBe(392 + 54);
    expect(topMarkerOuterRadius(5)).toBe(392 + 54 + 20);
  });

  it('shrink back down when there are fewer rings', () => {
    expect(bezelBaseRadius(2)).toBeLessThan(bezelBaseRadius(5));
    expect(topMarkerOuterRadius(2)).toBeLessThan(topMarkerOuterRadius(5));
  });
});

describe('sweep hand radii', () => {
  it('sit at a fixed margin around the bezel, same as the old fixed-radius hand', () => {
    expect(sweepHandInnerRadius(5)).toBe(392 + 54 - 8);
    expect(sweepHandOuterRadius(5)).toBe(392 + 54 + 14);
    expect(sweepHandDotRadius(5)).toBe(392 + 54 + 16);
  });

  it('track the bezel as the ring stack grows or shrinks, instead of floating at a fixed radius', () => {
    expect(sweepHandOuterRadius(6)).toBeGreaterThan(sweepHandOuterRadius(5));
    expect(sweepHandOuterRadius(2)).toBeLessThan(sweepHandOuterRadius(5));
  });
});

describe('handAngle', () => {
  it('is 0 at the top of the minute', () => {
    expect(handAngle(new Date('2026-01-01T00:00:00.000Z'))).toBe(0);
  });

  it('is 180 at 30 seconds', () => {
    expect(handAngle(new Date('2026-01-01T00:00:30.000Z'))).toBe(180);
  });
});

describe('bezelTicks', () => {
  it('produces 60 ticks, major every 5th', () => {
    const ticks = bezelTicks(446);
    expect(ticks).toHaveLength(60);
    expect(ticks[0].stroke).toBe('#6B7079');
    expect(ticks[1].stroke).toBe('#3D414A');
    expect(ticks[5].stroke).toBe('#6B7079');
  });

  it('sits farther out for a larger base radius', () => {
    const closer = bezelTicks(446)[0];
    const farther = bezelTicks(500)[0];
    expect(Math.hypot(farther.x1 - 500, farther.y1 - 500)).toBeGreaterThan(Math.hypot(closer.x1 - 500, closer.y1 - 500));
  });
});

describe('directionChevrons', () => {
  it('produces one chevron per gap between adjacent rings', () => {
    expect(directionChevrons([392, 334, 276, 218, 160])).toHaveLength(4);
    expect(directionChevrons([392, 160])).toHaveLength(1);
  });

  it('places each chevron at the midpoint of its gap', () => {
    const [chevron] = directionChevrons([400, 300]);
    const y = 500 - 350; // midpoint radius (350) measured from center
    expect(chevron.points).toBe(`493,${y - 8} 505,${y} 493,${y + 8}`);
  });

  it('produces no chevrons for a single ring', () => {
    expect(directionChevrons([160])).toEqual([]);
  });
});

describe('labelArcHalfLength', () => {
  it('scales linearly with radius, so a fixed pixel gap around the dot stays constant across rings', () => {
    expect(labelArcHalfLength(100)).toBeCloseTo(109.96, 1);
    expect(labelArcHalfLength(200)).toBeCloseTo(2 * labelArcHalfLength(100));
  });
});

describe('topMarkerPoints', () => {
  it('is a triangle centered on x=500 with its apex pointing inward (toward center)', () => {
    const points = topMarkerPoints(5).split(' ').map((pair) => pair.split(',').map(Number));
    expect(points).toHaveLength(3);
    const [left, right, apex] = points;
    expect(left).toEqual([488, 34]);
    expect(right).toEqual([512, 34]);
    expect(apex[0]).toBe(500);
    expect(apex[1]).toBeCloseTo(54.78, 1);
    expect(apex[1]).toBeGreaterThan(left[1]);
  });

  it('is equilateral: all three sides have the same length', () => {
    const [left, right, apex] = topMarkerPoints(5)
      .split(' ')
      .map((pair) => pair.split(',').map(Number));
    const distance = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const base = distance(left, right);
    expect(distance(left, apex)).toBeCloseTo(base, 0);
    expect(distance(right, apex)).toBeCloseTo(base, 0);
  });

  it('grows outward with the ring stack, same as the bezel it sits just outside of', () => {
    expect(topMarkerOuterRadius(6)).toBeGreaterThan(topMarkerOuterRadius(5));
    expect(topMarkerInnerRadius(6)).toBeGreaterThan(topMarkerInnerRadius(5));
  });
});

describe('hexToRgba', () => {
  it('converts a hex color to rgba', () => {
    expect(hexToRgba('#34D399', 0.7)).toBe('rgba(52, 211, 153, 0.7)');
  });
});

describe('meetingAngle', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  it('is 0 when the meeting is right now', () => {
    expect(meetingAngle(now, now)).toBe(0);
  });

  it('is negative 15°/hour for a future meeting — hasn\'t swept up to NOW yet', () => {
    expect(meetingAngle(new Date('2026-01-01T01:00:00.000Z'), now)).toBe(-15);
    expect(meetingAngle(new Date('2026-01-01T04:00:00.000Z'), now)).toBe(-60);
  });

  it('is positive 15°/hour for a past meeting — already swept past NOW', () => {
    expect(meetingAngle(new Date('2025-12-31T23:00:00.000Z'), now)).toBe(15);
  });

  it('matches the sign convention of workingHoursArcPath (currentFrac - eventFrac)', () => {
    // a boundary 3 hours in the future (e.g. workEnd relative to now) gets the same
    // negative angle as a meeting 3 hours in the future
    const threeHoursFuture = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    expect(meetingAngle(threeHoursFuture, now)).toBe((0 - 3) * DEGREES_PER_HOUR);
  });
});

describe('parseMeetingInstant', () => {
  it('parses a valid ISO string', () => {
    const instant = parseMeetingInstant('2026-01-01T10:00:00.000Z');
    expect(instant).toBeInstanceOf(Date);
    expect(instant?.toISOString()).toBe('2026-01-01T10:00:00.000Z');
  });

  it('returns null for an unparseable string', () => {
    expect(parseMeetingInstant('not-a-date')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseMeetingInstant('')).toBeNull();
  });
});

describe('angleFromCenterOffset', () => {
  it('is 0 straight up from center', () => {
    expect(angleFromCenterOffset(0, -10)).toBeCloseTo(0);
  });

  it('is 90 to the right of center', () => {
    expect(angleFromCenterOffset(10, 0)).toBeCloseTo(90);
  });

  it('is 180 straight down from center', () => {
    expect(angleFromCenterOffset(0, 10)).toBeCloseTo(180);
  });

  it('is 270 (not negative) to the left of center', () => {
    expect(angleFromCenterOffset(-10, 0)).toBeCloseTo(270);
  });
});

describe('angleDelta', () => {
  it('is positive for a small clockwise turn', () => {
    expect(angleDelta(10, 40)).toBeCloseTo(30);
  });

  it('is negative for a small counterclockwise turn', () => {
    expect(angleDelta(40, 10)).toBeCloseTo(-30);
  });

  it('takes the short way across the 0/360 seam', () => {
    expect(angleDelta(350, 10)).toBeCloseTo(20);
    expect(angleDelta(10, 350)).toBeCloseTo(-20);
  });

  it('is 0 for no change', () => {
    expect(angleDelta(90, 90)).toBe(0);
  });
});

describe('offsetMsFromAngle', () => {
  it('converts one hour of rotation (15deg) to one hour in ms', () => {
    expect(offsetMsFromAngle(15)).toBe(3_600_000);
  });

  it('is negative for a counterclockwise rotation', () => {
    expect(offsetMsFromAngle(-30)).toBe(-7_200_000);
  });

  it('is 0 for no rotation', () => {
    expect(offsetMsFromAngle(0)).toBe(0);
  });
});

describe('workingHoursArcPath', () => {
  // parses `M${x1},${y1} A${r},${r} 0 ${largeArcFlag} ${sweepFlag} ${x2},${y2}`
  function parsePath(path: string) {
    const match = path.match(/^M([-\d.]+),([-\d.]+) A([-\d.]+),([-\d.]+) 0 (\d) (\d) ([-\d.]+),([-\d.]+)$/);
    if (!match) throw new Error(`unparseable arc path: ${path}`);
    const [, x1, y1, rx, ry, largeArcFlag, sweepFlag, x2, y2] = match;
    return {
      start: { x: Number(x1), y: Number(y1) },
      end: { x: Number(x2), y: Number(y2) },
      rx: Number(rx),
      ry: Number(ry),
      largeArcFlag: Number(largeArcFlag),
      sweepFlag: Number(sweepFlag),
    };
  }

  // samples points along the arc using the SVG endpoint-to-center-parameterization
  // formula (spec F.6.5/F.6.6), so the test verifies the actual rendered geometry
  // rather than just the path string's flag values
  function sampleArcPoints(path: string, n = 36): Point[] {
    const { start, end, rx, ry, largeArcFlag, sweepFlag } = parsePath(path);
    const x1p = (start.x - end.x) / 2;
    const y1p = (start.y - end.y) / 2;
    const sign = largeArcFlag !== sweepFlag ? 1 : -1;
    const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    const co = sign * Math.sqrt(Math.max(0, num / den));
    const cxp = co * ((rx * y1p) / ry);
    const cyp = co * ((-ry * x1p) / rx);
    const cx = cxp + (start.x + end.x) / 2;
    const cy = cyp + (start.y + end.y) / 2;

    const vectorAngle = (ux: number, uy: number, vx: number, vy: number) => {
      const dot = ux * vx + uy * vy;
      const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
      let ang = Math.acos(Math.min(1, Math.max(-1, dot / len)));
      if (ux * vy - uy * vx < 0) ang = -ang;
      return ang;
    };
    const theta1 = vectorAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dtheta = vectorAngle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sweepFlag && dtheta > 0) dtheta -= 2 * Math.PI;
    if (sweepFlag && dtheta < 0) dtheta += 2 * Math.PI;

    const points: Point[] = [];
    for (let i = 0; i <= n; i++) {
      const t = theta1 + (dtheta * i) / n;
      points.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
    }
    return points;
  }

  function maxDeviationFromRing(path: string, radius: number): number {
    const points = sampleArcPoints(path);
    return Math.max(...points.map((p) => Math.abs(Math.hypot(p.x - CENTER, p.y - CENTER) - radius)));
  }

  it('stays on its own ring for a >12h span — the reported bug (7-20 is a 13h span)', () => {
    const path = workingHoursArcPath(392, 21.8333, 7, 20);
    expect(maxDeviationFromRing(path, 392)).toBeLessThan(0.5);
  });

  it('still renders correctly for the common <12h case (default 9-18, a 9h span)', () => {
    const path = workingHoursArcPath(392, 12, 9, 18);
    expect(maxDeviationFromRing(path, 392)).toBeLessThan(0.5);
  });

  it('stays on the ring for a span very close to 24h (23h)', () => {
    const path = workingHoursArcPath(392, 12, 0, 23);
    expect(maxDeviationFromRing(path, 392)).toBeLessThan(0.5);
  });

  it('stays on the ring for a span just above 0h', () => {
    const path = workingHoursArcPath(392, 12, 9, 9.25);
    expect(maxDeviationFromRing(path, 392)).toBeLessThan(0.5);
  });

  it('flips the large-arc-flag exactly at the 180°/12h boundary', () => {
    expect(parsePath(workingHoursArcPath(100, 12, 9, 20)).largeArcFlag).toBe(0); // 11h, <12h
    expect(parsePath(workingHoursArcPath(100, 12, 9, 21)).largeArcFlag).toBe(0); // 12h exactly, boundary
    expect(parsePath(workingHoursArcPath(100, 12, 9, 22)).largeArcFlag).toBe(1); // 13h, >12h
  });

  it('sweeps the correct angular distance, not just the correct flag (13h -> 195°, not the complementary 165°)', () => {
    const path = workingHoursArcPath(392, 21.8333, 7, 20);
    const points = sampleArcPoints(path, 720);
    const totalLength = points.reduce((sum, p, i, arr) => (i === 0 ? 0 : sum + Math.hypot(p.x - arr[i - 1].x, p.y - arr[i - 1].y)), 0);
    const expectedLength = (392 * (195 * Math.PI)) / 180;
    expect(totalLength).toBeCloseTo(expectedLength, 0);
  });
});

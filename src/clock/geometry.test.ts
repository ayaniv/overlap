import { describe, expect, it } from 'vitest';
import {
  bezelBaseRadius,
  bezelTicks,
  directionChevrons,
  handAngle,
  hexToRgba,
  labelArcHalfLength,
  meetingAngle,
  outermostRingRadius,
  parseMeetingInstant,
  pointOnCircle,
  ringRadius,
  sweepHandDotRadius,
  sweepHandInnerRadius,
  sweepHandOuterRadius,
  topMarkerInnerRadius,
  topMarkerOuterRadius,
  topMarkerPoints,
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

  it('is positive 15°/hour for a future meeting', () => {
    expect(meetingAngle(new Date('2026-01-01T01:00:00.000Z'), now)).toBe(15);
    expect(meetingAngle(new Date('2026-01-01T04:00:00.000Z'), now)).toBe(60);
  });

  it('is negative 15°/hour for a past meeting', () => {
    expect(meetingAngle(new Date('2025-12-31T23:00:00.000Z'), now)).toBe(-15);
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

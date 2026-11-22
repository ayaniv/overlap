import { describe, expect, it } from 'vitest';
import { neoMarkTrailPath, offsetClosedOutline } from './neoMarkTrail';

describe('offsetClosedOutline', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  const span = (points: { x: number; y: number }[]) => Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));

  it('moves a closed outline outward, for both windings', () => {
    expect(span(offsetClosedOutline(square, 2))).toBeGreaterThan(10);
    expect(span(offsetClosedOutline([...square].reverse(), 2))).toBeGreaterThan(10);
  });
});

describe('neoMarkTrailPath', () => {
  it('is one closed path of finite points', () => {
    const d = neoMarkTrailPath(6);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d).not.toContain('NaN');
  });
});

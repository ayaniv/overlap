import { CENTER, NEO_MARK_CENTER, NEO_MARK_OUTLINE, neoMarkScale } from './geometry';

type Vec = { x: number; y: number };

// the outline only uses absolute M, L, H, V, C and Z commands
function sampleOutline(d: string, stepsPerCurve: number): Vec[] {
  const tokens = d.match(/[MLHVCZ]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const points: Vec[] = [];
  let i = 0;
  let command = '';
  let current: Vec = { x: 0, y: 0 };
  const next = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Z]/.test(tokens[i])) command = tokens[i++];
    if (command === 'Z') break;
    if (command === 'M' || command === 'L') {
      current = { x: next(), y: next() };
      points.push(current);
    } else if (command === 'H') {
      current = { x: next(), y: current.y };
      points.push(current);
    } else if (command === 'V') {
      current = { x: current.x, y: next() };
      points.push(current);
    } else if (command === 'C') {
      const p0 = current;
      const p1 = { x: next(), y: next() };
      const p2 = { x: next(), y: next() };
      const p3 = { x: next(), y: next() };
      for (let s = 1; s <= stepsPerCurve; s++) {
        const t = s / stepsPerCurve;
        const u = 1 - t;
        const a = u * u * u;
        const b = 3 * u * u * t;
        const c = 3 * u * t * t;
        const e = t * t * t;
        points.push({ x: a * p0.x + b * p1.x + c * p2.x + e * p3.x, y: a * p0.y + b * p1.y + c * p2.y + e * p3.y });
      }
      current = p3;
    }
  }
  // drop points that repeat their neighbour; a zero-length edge has no normal
  return points.filter((p, k) => {
    const q = points[(k + 1) % points.length];
    return Math.hypot(p.x - q.x, p.y - q.y) > 1e-6;
  });
}

// Moves each point of a closed outline `gap` outward along the normal of its
// two edges (averaged). Every corner of the Neo mark is rounded and sampled
// densely, so this stays one clean line, without a full polygon offset.
export function offsetClosedOutline(points: Vec[], gap: number): Vec[] {
  const n = points.length;
  const normals = points.map((_, k) => {
    const prev = points[(k - 1 + n) % n];
    const next = points[(k + 1) % n];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    return { x: ty / len, y: -tx / len };
  });
  // the normals point outward on one winding and inward on the other: test
  // them against the centre of the points
  const cx = points.reduce((sum, p) => sum + p.x, 0) / n;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / n;
  const outward = points.reduce((sum, p, k) => sum + (p.x - cx) * normals[k].x + (p.y - cy) * normals[k].y, 0) > 0 ? 1 : -1;
  return points.map((p, k) => ({ x: p.x + outward * gap * normals[k].x, y: p.y + outward * gap * normals[k].y }));
}

// 12px outside the mark at the clock's full 700px width (1000 viewBox units
// / 700px); on a smaller screen the gap shrinks with the clock
export const NEO_MARK_TRAIL_GAP = 17;

// the path the running line follows: the mark's outline, in clock (viewBox)
// units, NEO_MARK_TRAIL_GAP outside it
export function neoMarkTrailPath(totalRings: number): string {
  const scale = neoMarkScale(totalRings);
  const inClock = sampleOutline(NEO_MARK_OUTLINE, 12).map((p) => ({
    x: CENTER + (p.x - NEO_MARK_CENTER) * scale,
    y: CENTER + (p.y - NEO_MARK_CENTER) * scale,
  }));
  const trail = offsetClosedOutline(inClock, NEO_MARK_TRAIL_GAP);
  return `M${trail.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')} Z`;
}

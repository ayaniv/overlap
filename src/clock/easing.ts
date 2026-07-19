// eased in-and-out so velocity is continuous at the endpoints — shared by the
// scrub hint's attract sweep (useScrubHintDemo) and its return-to-now
// animation (useScrubHintReturn) so the two can't drift apart.
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// t is expected in 0..1; at t === 1 this returns exactly `toDeg`
export const easedBetween = (fromDeg: number, toDeg: number, t: number) =>
  fromDeg + (toDeg - fromDeg) * easeInOutCubic(t);

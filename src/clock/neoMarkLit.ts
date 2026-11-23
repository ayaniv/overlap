// The Neo mark lights up while Neo's two main offices both work: a ring in
// each time zone must be in working hours. Matching on the time zone, not on
// a city id, also counts a city added by hand or from a share link.
export const NEO_OFFICE_TIMEZONES = ['Asia/Jerusalem', 'America/New_York'] as const;

export function isNeoMarkLit(rings: readonly { location: { timezoneId: string }; inHours: boolean }[]): boolean {
  return NEO_OFFICE_TIMEZONES.every((zone) => rings.some((ring) => ring.inHours && ring.location.timezoneId === zone));
}

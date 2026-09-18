// the only code that reads VITE_OVERLAP_API_URL — every other module asks
// this function instead, so there is exactly one place to change if the
// gating rule (trim, strip trailing slash, blank = off) ever needs to change
export function getOverlapApiBaseUrl(): string | null {
  const raw = import.meta.env.VITE_OVERLAP_API_URL;
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/$/, '');
}

// shared shape for a simple "has this happened before" boolean persisted to
// localStorage — used by both scrubHint.ts and googleCalendar.ts, which
// previously duplicated this same try/catch-wrapped read/write pattern.
export function readBooleanFlag(key: string, context: string): boolean {
  try {
    return window.localStorage.getItem(key) === 'true';
  } catch (err) {
    console.error(`overlap: failed to read ${context} state`, err);
    return false;
  }
}

export function writeBooleanFlag(key: string, context: string): void {
  try {
    window.localStorage.setItem(key, 'true');
  } catch (err) {
    console.error(`overlap: failed to persist ${context} state`, err);
  }
}

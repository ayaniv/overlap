import { logger } from '../logger/logger';

// shared shape for a simple "has this happened before" boolean persisted to
// localStorage — used by both scrubHint.ts and googleCalendar.ts, which
// previously duplicated this same try/catch-wrapped read/write pattern.
// These are plain module functions rather than components, so they use the
// `logger` singleton directly instead of useLogger() — the two entry points
// logger.ts documents.
export function readBooleanFlag(key: string, context: string): boolean {
  try {
    return window.localStorage.getItem(key) === 'true';
  } catch (err) {
    logger.error(err, `failed to read ${context} state`);
    return false;
  }
}

export function writeBooleanFlag(key: string, context: string): void {
  try {
    window.localStorage.setItem(key, 'true');
  } catch (err) {
    logger.error(err, `failed to persist ${context} state`);
  }
}

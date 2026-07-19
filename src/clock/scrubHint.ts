import { readBooleanFlag, writeBooleanFlag } from './localStorageFlag';

export const SCRUB_HINT_SEEN_STORAGE_KEY = 'overlap:scrub-hint-seen:v1';

export function hasSeenScrubHint(): boolean {
  return readBooleanFlag(SCRUB_HINT_SEEN_STORAGE_KEY, 'scrub-hint-seen');
}

export function markScrubHintSeen(): void {
  writeBooleanFlag(SCRUB_HINT_SEEN_STORAGE_KEY, 'scrub-hint-seen');
}

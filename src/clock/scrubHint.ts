export const SCRUB_HINT_SEEN_STORAGE_KEY = 'overlap:scrub-hint-seen:v1';

export function hasSeenScrubHint(): boolean {
  try {
    return window.localStorage.getItem(SCRUB_HINT_SEEN_STORAGE_KEY) === 'true';
  } catch (err) {
    console.error('overlap: failed to read scrub-hint-seen state', err);
    return false;
  }
}

export function markScrubHintSeen(): void {
  try {
    window.localStorage.setItem(SCRUB_HINT_SEEN_STORAGE_KEY, 'true');
  } catch (err) {
    console.error('overlap: failed to persist scrub-hint-seen state', err);
  }
}

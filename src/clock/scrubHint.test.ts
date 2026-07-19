import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasSeenScrubHint, markScrubHintSeen, SCRUB_HINT_SEEN_STORAGE_KEY } from './scrubHint';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('hasSeenScrubHint / markScrubHintSeen', () => {
  it('is false when nothing has been persisted', () => {
    expect(hasSeenScrubHint()).toBe(false);
  });

  it('is true after markScrubHintSeen', () => {
    markScrubHintSeen();
    expect(hasSeenScrubHint()).toBe(true);
  });

  it('persists under the documented storage key', () => {
    markScrubHintSeen();
    expect(window.localStorage.getItem(SCRUB_HINT_SEEN_STORAGE_KEY)).toBe('true');
  });

  it('read failures are caught and default to false', () => {
    // Storage.prototype, not the instance — jsdom proxies localStorage, so an
    // instance-level spy never fires and this test would pass vacuously
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(hasSeenScrubHint()).toBe(false);
  });

  it('write failures are caught without throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => markScrubHintSeen()).not.toThrow();
  });
});

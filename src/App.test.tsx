import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsProvider } from './analytics/AnalyticsProvider';
import { createMockAnalyticsService } from './analytics/mockAnalyticsService';
import { LoggerProvider } from './logger/LoggerProvider';
import { createMockLoggerService } from './logger/mockLoggerService';
import App from './App';
import * as googleCalendar from './clock/googleCalendar';
import { SCRUB_HINT_SEEN_STORAGE_KEY } from './clock/scrubHint';
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from './hooks/useClockConfig';
import { DEFAULT_IDLE_TIMEOUT_MS } from './hooks/useIsIdle';
import type { ClockConfig } from './clock/types';

vi.mock('./clock/googleCalendar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./clock/googleCalendar')>();
  return { ...actual, scheduleMeetingOnGoogleCalendar: vi.fn(), deleteMeetingFromGoogleCalendar: vi.fn() };
});

// useSweepAngle (reduced-motion) and useIsPortrait (orientation) both read
// window.matchMedia, which jsdom doesn't implement; `portrait` lets individual
// tests opt into simulating the portrait/mobile layout
function stubMatchMedia(portrait = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(orientation: portrait)' ? portrait : false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  stubMatchMedia();
  window.localStorage.clear();
  // pre-seed "already dismissed" so the ~400 existing assertions in this file
  // (written before this feature existed) keep exercising the app's steady
  // state, not a fresh first-run; the dedicated describe block below removes
  // this key explicitly wherever it wants the first-run scenario instead
  window.localStorage.setItem(SCRUB_HINT_SEEN_STORAGE_KEY, 'true');
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(googleCalendar.scheduleMeetingOnGoogleCalendar).mockReset();
  vi.mocked(googleCalendar.deleteMeetingFromGoogleCalendar).mockReset();
});

async function scrubForward(user: ReturnType<typeof userEvent.setup>) {
  const slider = screen.getByRole('slider');
  slider.focus();
  await user.keyboard('{ArrowUp}');
}

// ControlCluster starts collapsed behind the hamburger toggle (M7); open it before
// reaching for one of its action buttons
async function openClusterMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('control-menu-toggle'));
}

function renderApp(analyticsService = createMockAnalyticsService(), loggerService = createMockLoggerService()) {
  const { unmount } = render(
    <AnalyticsProvider service={analyticsService}>
      <LoggerProvider service={loggerService}>
        <App />
      </LoggerProvider>
    </AnalyticsProvider>,
  );
  return { analytics: analyticsService, logger: loggerService, unmount };
}

// scheduling has no separate mode/form/icon of its own anymore — scrubbing
// always swaps ControlCluster's Config/Share icon menu for Cancel/Schedule,
// on any platform (see WorldClock's isScrubActionBarVisible)
describe('App — scrubbing swaps ControlCluster to Cancel/Schedule, on any platform', () => {
  it('swaps to Cancel/Schedule on the first scrub, in landscape/desktop', async () => {
    const user = userEvent.setup();
    renderApp();

    await scrubForward(user);

    expect(screen.queryByTestId('control-menu-toggle')).toBeNull();
    expect(screen.getByTestId('control-scrub-cancel-button')).toBeTruthy();
    expect(screen.getByTestId('control-scrub-schedule-button')).toBeTruthy();
  });

  it('swaps to Cancel/Schedule on the first scrub in portrait too — same behavior as desktop', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    renderApp();

    await scrubForward(user);

    expect(screen.queryByTestId('control-menu-toggle')).toBeNull();
    expect(screen.getByTestId('control-scrub-cancel-button')).toBeTruthy();
    expect(screen.getByTestId('control-scrub-schedule-button')).toBeTruthy();
  });

  it('Cancel resets the scrub and restores the normal Config/Share menu', async () => {
    const user = userEvent.setup();
    renderApp();

    await scrubForward(user);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).not.toBe('0');

    await user.click(screen.getByTestId('control-scrub-cancel-button'));

    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByTestId('control-menu-toggle')).toBeTruthy();
  });

  it('Config is unreachable while a scrub preview is active (no way to leave a stale preview stuck behind it)', async () => {
    const user = userEvent.setup();
    renderApp();

    await scrubForward(user);

    expect(screen.queryByTestId('control-config-button')).toBeNull();
  });
});

describe('App — sharing fires an analytics event with the outcome', () => {
  it('fires clock_shared with the share outcome when the Share button is clicked', async () => {
    // jsdom implements neither navigator.share nor navigator.clipboard; stubbing
    // clipboard only (no .share) forces the deterministic "copied" fallback path
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const user = userEvent.setup();
    const { analytics } = renderApp();

    await openClusterMenu(user);
    await user.click(screen.getByTestId('control-share-button'));

    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('clock_shared', { outcome: 'copied' }));
  });
});

// matchedMeeting is computed via useMemo (App.tsx) keyed on the previewed instant —
// these exercise that it still recomputes correctly as the scrub preview moves,
// rather than getting stuck on a stale value (the main risk a bad memo dependency
// list would introduce). Surfaced now as ControlCluster's extra "Remove Meeting"
// scrub button, not a title-bearing banner (see ControlCluster.test.tsx).
describe('App — matchedMeeting reflects an already-scheduled meeting as the scrub preview moves', () => {
  function seedConfigWithMeeting(startISO: string): void {
    const config: ClockConfig = {
      ...DEFAULT_CONFIG,
      meetings: [{ id: 'm1', title: 'Design sync', startISO }],
    };
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  }

  beforeEach(() => {
    window.localStorage.setItem('overlap:google-connected:v1', 'true');
  });

  it('surfaces a Remove Meeting button once the preview lands within the match tolerance', async () => {
    seedConfigWithMeeting(new Date(Date.now() + 3 * 60_000).toISOString());
    const user = userEvent.setup();
    renderApp();

    const slider = screen.getByRole('slider');
    slider.focus();
    for (let step = 0; step < 3; step += 1) {
      await user.keyboard('{ArrowUp}');
    }

    expect(screen.getByTestId('control-remove-meeting-button')).toBeTruthy();
  });

  it('stops surfacing Remove Meeting once scrubbed back out of the match tolerance', async () => {
    seedConfigWithMeeting(new Date(Date.now() + 3 * 60_000).toISOString());
    const user = userEvent.setup();
    renderApp();

    const slider = screen.getByRole('slider');
    slider.focus();
    for (let step = 0; step < 3; step += 1) {
      await user.keyboard('{ArrowUp}');
    }
    expect(screen.getByTestId('control-remove-meeting-button')).toBeTruthy();

    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');

    expect(screen.queryByTestId('control-remove-meeting-button')).toBeNull();
  });

  it('does not surface Remove Meeting when this browser has never connected to Google Calendar', async () => {
    window.localStorage.removeItem('overlap:google-connected:v1');
    seedConfigWithMeeting(new Date(Date.now() + 3 * 60_000).toISOString());
    const user = userEvent.setup();
    renderApp();

    const slider = screen.getByRole('slider');
    slider.focus();
    for (let step = 0; step < 3; step += 1) {
      await user.keyboard('{ArrowUp}');
    }

    expect(screen.queryByTestId('control-remove-meeting-button')).toBeNull();
  });
});

describe('App — Remove Meeting (ControlCluster scrub button)', () => {
  function seedConfigWithMeeting(startISO: string, googleEventId?: string): void {
    const config: ClockConfig = {
      ...DEFAULT_CONFIG,
      meetings: [{ id: 'm1', title: 'Design sync', startISO, ...(googleEventId ? { googleEventId } : {}) }],
    };
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    window.localStorage.setItem('overlap:google-connected:v1', 'true');
  }

  async function scrubOntoMeeting(user: ReturnType<typeof userEvent.setup>) {
    const slider = screen.getByRole('slider');
    slider.focus();
    for (let step = 0; step < 3; step += 1) {
      await user.keyboard('{ArrowUp}');
    }
  }

  it('deletes the Google Calendar event, removes the meeting, resets the scrub, and shows a toast', async () => {
    seedConfigWithMeeting(new Date(Date.now() + 3 * 60_000).toISOString(), 'evt-1');
    vi.mocked(googleCalendar.deleteMeetingFromGoogleCalendar).mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { analytics } = renderApp();

    await scrubOntoMeeting(user);
    await user.click(screen.getByTestId('control-remove-meeting-button'));

    await waitFor(() => expect(googleCalendar.deleteMeetingFromGoogleCalendar).toHaveBeenCalledWith('evt-1'));
    await waitFor(() => expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0'));
    expect((await screen.findByTestId('toast-message')).textContent).toBe('Meeting removed');
    expect(screen.queryByTestId('control-remove-meeting-button')).toBeNull();
    expect(analytics.trackEvent).toHaveBeenCalledWith('meeting_deleted');
  });

  it('removes a meeting with no googleEventId locally, without calling the Calendar API', async () => {
    seedConfigWithMeeting(new Date(Date.now() + 3 * 60_000).toISOString());
    const user = userEvent.setup();
    renderApp();

    await scrubOntoMeeting(user);
    await user.click(screen.getByTestId('control-remove-meeting-button'));

    await waitFor(() => expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0'));
    expect(googleCalendar.deleteMeetingFromGoogleCalendar).not.toHaveBeenCalled();
    expect((await screen.findByTestId('toast-message')).textContent).toBe('Meeting removed');
  });

  it('shows an error toast and keeps the scrub preview when the Calendar delete fails', async () => {
    seedConfigWithMeeting(new Date(Date.now() + 3 * 60_000).toISOString(), 'evt-1');
    const deleteError = new Error('boom');
    vi.mocked(googleCalendar.deleteMeetingFromGoogleCalendar).mockRejectedValue(deleteError);
    const user = userEvent.setup();
    const { logger } = renderApp();

    await scrubOntoMeeting(user);
    await user.click(screen.getByTestId('control-remove-meeting-button'));

    expect((await screen.findByTestId('toast-message')).textContent).toBe('boom');
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).not.toBe('0');
    expect(screen.getByTestId('control-remove-meeting-button')).toBeTruthy();
    expect(logger.error).toHaveBeenCalledWith(deleteError, 'failed to remove the matched meeting from the scrub buttons');
  });

  // mirrors the equivalent quick-schedule regression test: the ring stays
  // scrubbable while the delete request is in flight, so resolving it must not
  // clobber a newer preview the user scrubbed to in the meantime
  it('does not snap the scrub preview back to now if the user scrubs further while Remove Meeting is still in flight', async () => {
    seedConfigWithMeeting(new Date(Date.now() + 3 * 60_000).toISOString(), 'evt-1');
    let resolveDelete: () => void = () => {};
    vi.mocked(googleCalendar.deleteMeetingFromGoogleCalendar).mockImplementation(() => new Promise<void>((resolve) => (resolveDelete = resolve)));
    const user = userEvent.setup();
    renderApp();

    await scrubOntoMeeting(user);
    const offsetBeforeRemove = screen.getByRole('slider').getAttribute('aria-valuenow');
    await user.click(screen.getByTestId('control-remove-meeting-button'));
    await waitFor(() => expect(googleCalendar.deleteMeetingFromGoogleCalendar).toHaveBeenCalledTimes(1));

    screen.getByRole('slider').focus();
    await user.keyboard('{ArrowUp}');
    const offsetAfterFurtherScrub = screen.getByRole('slider').getAttribute('aria-valuenow');
    expect(offsetAfterFurtherScrub).not.toBe(offsetBeforeRemove);

    resolveDelete();
    expect((await screen.findByTestId('toast-message')).textContent).toBe('Meeting removed');
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe(offsetAfterFurtherScrub);
  });
});

// quick-schedule: scrubbing swaps ControlCluster's icon menu for Cancel/
// Schedule (see WorldClock's isScrubActionBarVisible) — on any
// platform, see the describe block above; these exercise the actual
// schedule/cancel logic behind those buttons, straight to Google Calendar,
// with no form in between
describe('App — quick-schedule (ControlCluster scrub buttons)', () => {
  it('schedules a 30-minute meeting with an auto-generated overlap title, then resets the scrub and shows a toast', async () => {
    stubMatchMedia(true);
    vi.mocked(googleCalendar.scheduleMeetingOnGoogleCalendar).mockResolvedValue('evt-1');
    const user = userEvent.setup();
    const { analytics } = renderApp();

    await scrubForward(user);
    await user.click(screen.getByTestId('control-scrub-schedule-button'));

    await waitFor(() => expect(googleCalendar.scheduleMeetingOnGoogleCalendar).toHaveBeenCalledTimes(1));
    const [title, , durationMinutes] = vi.mocked(googleCalendar.scheduleMeetingOnGoogleCalendar).mock.calls[0];
    expect(title).toMatch(/^Overlap-Clock Meeting: /);
    expect(durationMinutes).toBe(30);

    await waitFor(() => expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0'));
    expect((await screen.findByTestId('toast-message')).textContent).toBe('Meeting scheduled');
    expect(analytics.trackEvent).toHaveBeenCalledWith('meeting_scheduled', { duration_minutes: 30 });
  });

  it('shows an error toast and keeps the scrub preview (so the user can retry) when scheduling fails', async () => {
    stubMatchMedia(true);
    const scheduleError = new Error('boom');
    vi.mocked(googleCalendar.scheduleMeetingOnGoogleCalendar).mockRejectedValue(scheduleError);
    const user = userEvent.setup();
    const { logger } = renderApp();

    await scrubForward(user);
    await user.click(screen.getByTestId('control-scrub-schedule-button'));

    expect((await screen.findByTestId('toast-message')).textContent).toBe('boom');
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).not.toBe('0');
    expect(screen.getByTestId('control-scrub-schedule-button')).toBeTruthy();
    expect(logger.error).toHaveBeenCalledWith(scheduleError, 'failed to quick-schedule a meeting from the scrub buttons');
  });

  it('Cancel resets the scrub preview without scheduling anything', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    renderApp();

    await scrubForward(user);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).not.toBe('0');

    await user.click(screen.getByTestId('control-scrub-cancel-button'));

    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0');
    expect(googleCalendar.scheduleMeetingOnGoogleCalendar).not.toHaveBeenCalled();
  });

  // the ring stays scrubbable while a schedule request is in flight (only
  // ControlCluster's own buttons are disabled) — resolving that request must not
  // clobber a newer preview the user scrubbed to in the meantime
  it('does not snap the scrub preview back to now if the user scrubs further while Schedule is still in flight', async () => {
    stubMatchMedia(true);
    let resolveSchedule: (eventId: string) => void = () => {};
    vi.mocked(googleCalendar.scheduleMeetingOnGoogleCalendar).mockImplementation(
      () => new Promise<string>((resolve) => (resolveSchedule = resolve)),
    );
    const user = userEvent.setup();
    renderApp();

    await scrubForward(user);
    const offsetBeforeSchedule = screen.getByRole('slider').getAttribute('aria-valuenow');
    await user.click(screen.getByTestId('control-scrub-schedule-button'));
    await waitFor(() => expect(googleCalendar.scheduleMeetingOnGoogleCalendar).toHaveBeenCalledTimes(1));

    await scrubForward(user);
    const offsetAfterFurtherScrub = screen.getByRole('slider').getAttribute('aria-valuenow');
    expect(offsetAfterFurtherScrub).not.toBe(offsetBeforeSchedule);

    resolveSchedule('evt-1');
    expect((await screen.findByTestId('toast-message')).textContent).toBe('Meeting scheduled');
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe(offsetAfterFurtherScrub);
  });
});

// mobile Config flow: the desktop floating ConfigPanel has no scroll container
// (position: absolute inside an overflow:hidden stage), so the on-screen keyboard
// opening on the city-search tap could push Add/Manage-locations off-screen with
// no way back to it. MobileConfigView (a real full-screen scrollable page)
// replaces it on portrait; desktop keeps the floating accordion unchanged.
describe('App — mobile Config view replaces the floating panel on portrait', () => {
  it('opens the full-screen MobileConfigView (both sections, no accordion) instead of the floating panel', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    renderApp();

    await openClusterMenu(user);
    await user.click(screen.getByTestId('control-config-button'));

    expect(screen.getByTestId('mobile-config-title')).toBeTruthy();
    expect(screen.getByLabelText('Search city')).toBeTruthy();
    // Manage locations' rows visible at once, alongside Add location — no
    // accordion click needed to reach them (unlike the desktop ConfigPanel)
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('Done returns to view mode, closing the full-screen view', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    renderApp();

    await openClusterMenu(user);
    await user.click(screen.getByTestId('control-config-button'));
    await user.click(screen.getByTestId('mobile-config-done'));

    expect(screen.queryByTestId('mobile-config-title')).toBeNull();
  });

  it('keeps the desktop floating accordion panel on non-portrait, unaffected', async () => {
    const user = userEvent.setup();
    renderApp();

    await openClusterMenu(user);
    await user.click(screen.getByTestId('control-config-button'));

    expect(screen.queryByTestId('mobile-config-title')).toBeNull();
    expect(screen.getByTestId('manage-locations-section-toggle')).toBeTruthy();
  });
});

describe('App — first-time scrub hint', () => {
  beforeEach(() => {
    window.localStorage.removeItem(SCRUB_HINT_SEEN_STORAGE_KEY);
  });

  it('shows immediately on load when not yet dismissed — same as the header/title/buttons, no activity required', () => {
    renderApp();
    expect(screen.getByTestId('scrub-hint-dismiss-button')).toBeTruthy();
  });

  it('tracks scrub_hint_shown when it appears', () => {
    const { analytics } = renderApp();
    expect(analytics.trackEvent).toHaveBeenCalledWith('scrub_hint_shown');
  });

  it('never shows if already marked as seen', () => {
    window.localStorage.setItem(SCRUB_HINT_SEEN_STORAGE_KEY, 'true');
    renderApp();
    expect(screen.queryByTestId('scrub-hint-dismiss-button')).toBeNull();
  });

  it('does not track scrub_hint_shown when already marked as seen', () => {
    window.localStorage.setItem(SCRUB_HINT_SEEN_STORAGE_KEY, 'true');
    const { analytics } = renderApp();
    expect(analytics.trackEvent).not.toHaveBeenCalledWith('scrub_hint_shown');
  });

  it('is removed from the DOM (not just hidden) and never reappears after Got it is clicked', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp();
    expect(screen.getByTestId('scrub-hint-dismiss-button')).toBeTruthy();

    await user.click(screen.getByTestId('scrub-hint-dismiss-button'));
    // the overlay outlives the click by the length of the return animation
    await waitFor(() => expect(screen.queryByTestId('scrub-hint-overlay')).toBeNull(), { timeout: 2000 });
    expect(window.localStorage.getItem(SCRUB_HINT_SEEN_STORAGE_KEY)).toBe('true');

    unmount();
    renderApp();
    expect(screen.queryByTestId('scrub-hint-dismiss-button')).toBeNull();
  });

  it('keeps the hint overlay on screen while the clock animates back to now, rather than dismissing on the same tick', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByTestId('scrub-hint-dismiss-button'));

    // still mounted — the hand is riding back to now, not gone in one frame
    expect(screen.getByTestId('scrub-hint-overlay')).toBeTruthy();
  });

  it('fades the tooltip out immediately on Got it, while the hand is still returning', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByTestId('scrub-hint-dismiss-button'));

    expect(screen.getByTestId('scrub-hint-overlay').hasAttribute('data-dismissing')).toBe(true);
  });

  it('ignores a second Got it click while the return animation is still running', async () => {
    const user = userEvent.setup();
    const { analytics } = renderApp();

    // the button stays mounted (and, without pointer-events:none, hit-testable)
    // for the whole return animation — clicking it again must not re-fire
    await user.click(screen.getByTestId('scrub-hint-dismiss-button'));
    await user.click(screen.getByTestId('scrub-hint-dismiss-button'));

    const dismissEvents = analytics.trackEvent.mock.calls.filter((call) => call[0] === 'scrub_hint_dismissed');
    expect(dismissEvents).toHaveLength(1);
  });

  it('persists the seen flag on click, not when the return animation lands', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByTestId('scrub-hint-dismiss-button'));

    // asserted before the animation has had time to finish: a reload
    // mid-animation must not resurrect a hint the user explicitly dismissed
    expect(screen.getByTestId('scrub-hint-overlay')).toBeTruthy();
    expect(window.localStorage.getItem(SCRUB_HINT_SEEN_STORAGE_KEY)).toBe('true');
  });

  it('hides when the screen goes idle (removed from the DOM, not just paused) — same ambient-idle mechanism as the header/title/buttons', () => {
    // fake timers must be installed *before* renderApp mounts useIsIdle's effect:
    // sinon/vitest fake-timer installation only intercepts *future* setTimeout
    // calls, so a real setTimeout already scheduled during mount would never be
    // advanced by vi.advanceTimersByTime below. try/finally (rather than a bare
    // trailing vi.useRealTimers() call) guarantees fake-timer state doesn't leak
    // into later tests if an assertion in between throws.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    try {
      renderApp();
      expect(screen.getByTestId('scrub-hint-dismiss-button')).toBeTruthy();

      act(() => vi.advanceTimersByTime(DEFAULT_IDLE_TIMEOUT_MS));

      expect(screen.queryByTestId('scrub-hint-dismiss-button')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reappears once activity resumes after an idle hide, if still unseen, tracking scrub_hint_shown again', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    try {
      const { analytics } = renderApp();
      expect(analytics.trackEvent).toHaveBeenCalledTimes(1);

      act(() => vi.advanceTimersByTime(DEFAULT_IDLE_TIMEOUT_MS));
      expect(screen.queryByTestId('scrub-hint-dismiss-button')).toBeNull();

      act(() => window.dispatchEvent(new Event('pointermove')));

      expect(screen.getByTestId('scrub-hint-dismiss-button')).toBeTruthy();
      expect(analytics.trackEvent).toHaveBeenCalledTimes(2);
      expect(analytics.trackEvent).toHaveBeenNthCalledWith(2, 'scrub_hint_shown');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('App — Find Time', () => {
  // seeds every city (home + rings) with maximally wide hours so nothing can
  // ever end up 'out' -- these tests exercise checkbox/UI mechanics, not
  // real-world business-hours reconciliation. Without this, the auto-exclude
  // behavior (see the dedicated test below) would make checkbox state here
  // depend on the real wall-clock time the suite happens to run at, since
  // the default cities (Tel Aviv + SF/NY/London/Sydney) don't all reconcile
  // with home at every hour of the day.
  beforeEach(() => {
    const alwaysInHours = { workStart: 0, workEnd: 24 };
    const config: ClockConfig = {
      ...DEFAULT_CONFIG,
      home: { ...DEFAULT_CONFIG.home, ...alwaysInHours },
      rings: DEFAULT_CONFIG.rings.map((ring) => ({ ...ring, ...alwaysInHours })),
    };
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  });

  it('shows the Find Time button once at least one ring exists', () => {
    renderApp();
    expect(screen.getByTestId('control-find-time-button')).toBeTruthy();
  });

  it('lands on a found time and shows the scrub action bar with Find Time in it', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByTestId('control-find-time-button'));

    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    act(() => vi.advanceTimersByTime(700));
    vi.useRealTimers();

    expect(screen.getByTestId('control-scrub-cancel-button')).toBeTruthy();
    expect(screen.getByTestId('control-scrub-schedule-button')).toBeTruthy();
  });

  it('cancels the in-flight sweep animation and snaps immediately when a checkbox is toggled mid-flight', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByTestId('control-find-time-button'));

    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
    try {
      // still mid-flight -- well short of FIND_MEETING_TIME_SWEEP_MS (600ms)
      act(() => vi.advanceTimersByTime(100));

      const config = JSON.parse(window.localStorage.getItem('overlap:config:v1') ?? '{}');
      const [firstRing] = config.rings;
      act(() => fireEvent.click(screen.getByTestId(`ring-include-checkbox-${firstRing.id}`)));

      // the stale in-flight frame from the first sweep must be cancelled --
      // left running, it would keep easing the preview toward the now-abandoned
      // first target instead of the freshly re-searched one
      expect(cancelSpy).toHaveBeenCalled();
      // the re-entrant search snaps synchronously (see runFindMeetingTime),
      // so the checkbox already reflects the new result without waiting out
      // another animation
      expect((screen.getByTestId(`ring-include-checkbox-${firstRing.id}`) as HTMLInputElement).checked).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a checkbox for each ring city once a result is active, none for home', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('control-find-time-button'));

    const config = JSON.parse(window.localStorage.getItem('overlap:config:v1') ?? '{}');
    for (const ring of config.rings) {
      expect(screen.getByTestId(`ring-include-checkbox-${ring.id}`)).toBeTruthy();
    }
    expect(screen.queryByTestId(`ring-include-checkbox-${config.home.id}`)).toBeNull();
  });

  it('unchecking a ring excludes it and re-lands on a new result', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('control-find-time-button'));

    const config = JSON.parse(window.localStorage.getItem('overlap:config:v1') ?? '{}');
    const [firstRing] = config.rings;
    const checkbox = screen.getByTestId(`ring-include-checkbox-${firstRing.id}`) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);

    expect((screen.getByTestId(`ring-include-checkbox-${firstRing.id}`) as HTMLInputElement).checked).toBe(false);
  });

  it('re-checking a previously excluded ring includes it again', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('control-find-time-button'));

    const config = JSON.parse(window.localStorage.getItem('overlap:config:v1') ?? '{}');
    const [firstRing] = config.rings;
    const checkbox = screen.getByTestId(`ring-include-checkbox-${firstRing.id}`) as HTMLInputElement;

    fireEvent.click(checkbox);
    expect((screen.getByTestId(`ring-include-checkbox-${firstRing.id}`) as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByTestId(`ring-include-checkbox-${firstRing.id}`));
    expect((screen.getByTestId(`ring-include-checkbox-${firstRing.id}`) as HTMLInputElement).checked).toBe(true);
  });

  it('keeps the last remaining checked ring enabled, unlike the old disabled-checkbox behavior', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('control-find-time-button'));

    const config = JSON.parse(window.localStorage.getItem('overlap:config:v1') ?? '{}');
    for (const ring of config.rings.slice(0, -1)) {
      fireEvent.click(screen.getByTestId(`ring-include-checkbox-${ring.id}`));
    }

    const lastRing = config.rings.at(-1);
    const lastCheckbox = screen.getByTestId(`ring-include-checkbox-${lastRing.id}`) as HTMLInputElement;
    expect(lastCheckbox.disabled).toBe(false);
    expect(lastCheckbox.checked).toBe(true);
  });

  // regression: the last remaining checked ring's checkbox used to be
  // disabled to prevent reaching zero included rings, which read as broken
  // from the user's side. Unchecking it should not force the clock back to
  // "now" either — Find Time stays active with every ring shown unchecked,
  // since a search over home alone (trivially reconciled with itself) isn't
  // an error state.
  it('unchecking every ring, including the last one, leaves them all unchecked with Find Time still active', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('control-find-time-button'));

    const config = JSON.parse(window.localStorage.getItem('overlap:config:v1') ?? '{}');
    for (const ring of config.rings) {
      fireEvent.click(screen.getByTestId(`ring-include-checkbox-${ring.id}`));
    }

    for (const ring of config.rings) {
      expect((screen.getByTestId(`ring-include-checkbox-${ring.id}`) as HTMLInputElement).checked).toBe(false);
    }
    expect(screen.getByTestId('control-find-time-button').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('control-scrub-cancel-button')).toBeTruthy();
  });

  it('Cancel clears the find result: checkboxes disappear and the plain icon menu returns', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('control-find-time-button'));

    const config = JSON.parse(window.localStorage.getItem('overlap:config:v1') ?? '{}');
    expect(screen.getByTestId(`ring-include-checkbox-${config.rings[0].id}`)).toBeTruthy();

    fireEvent.click(screen.getByTestId('control-scrub-cancel-button'));

    expect(screen.queryByTestId(`ring-include-checkbox-${config.rings[0].id}`)).toBeNull();
    expect(screen.getByTestId('control-find-time-button')).toBeTruthy();
    expect(screen.queryByTestId('control-scrub-cancel-button')).toBeNull();
  });

  it('re-clicking Find Time while a result is active clears it, same as Cancel', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('control-find-time-button'));

    const config = JSON.parse(window.localStorage.getItem('overlap:config:v1') ?? '{}');
    expect(screen.getByTestId(`ring-include-checkbox-${config.rings[0].id}`)).toBeTruthy();
    expect(screen.getByTestId('control-find-time-button').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByTestId('control-find-time-button'));

    expect(screen.queryByTestId(`ring-include-checkbox-${config.rings[0].id}`)).toBeNull();
    expect(screen.queryByTestId('control-scrub-cancel-button')).toBeNull();
    expect(screen.getByTestId('control-find-time-button').getAttribute('aria-pressed')).toBe('false');
  });

  it('re-clicking Find Time after excluding a city resets to a fresh search with every ring included', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('control-find-time-button'));

    const config = JSON.parse(window.localStorage.getItem('overlap:config:v1') ?? '{}');
    const [firstRing] = config.rings;
    fireEvent.click(screen.getByTestId(`ring-include-checkbox-${firstRing.id}`));
    expect((screen.getByTestId(`ring-include-checkbox-${firstRing.id}`) as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByTestId('control-scrub-cancel-button'));
    fireEvent.click(screen.getByTestId('control-find-time-button'));

    expect((screen.getByTestId(`ring-include-checkbox-${firstRing.id}`) as HTMLInputElement).checked).toBe(true);
  });

  it('fires find_meeting_time_clicked with the expected payload shape', () => {
    const { analytics } = renderApp();
    fireEvent.click(screen.getByTestId('control-find-time-button'));

    // every city is forced always-in-hours by this describe's beforeEach, so
    // the payload is fully deterministic: every city (home + rings) fits
    // perfectly, and ring_count always reflects the full default ring set
    const ringCount = DEFAULT_CONFIG.rings.length;
    expect(analytics.trackEvent).toHaveBeenCalledWith('find_meeting_time_clicked', {
      ring_count: ringCount,
      fit_count: ringCount + 1,
      perfect_count: ringCount + 1,
      is_perfect: true,
    });
  });

  it('fires find_meeting_time_city_excluded / _included on checkbox toggles', () => {
    const { analytics } = renderApp();
    fireEvent.click(screen.getByTestId('control-find-time-button'));

    const config = JSON.parse(window.localStorage.getItem('overlap:config:v1') ?? '{}');
    const [firstRing] = config.rings;
    const checkbox = screen.getByTestId(`ring-include-checkbox-${firstRing.id}`);
    const ringCount = DEFAULT_CONFIG.rings.length;

    fireEvent.click(checkbox);
    expect(analytics.trackEvent).toHaveBeenCalledWith('find_meeting_time_city_excluded', { remaining_count: ringCount - 1 });

    fireEvent.click(checkbox);
    expect(analytics.trackEvent).toHaveBeenCalledWith('find_meeting_time_city_included', { remaining_count: ringCount });
  });

  it('auto-unchecks a ring that can never be reconciled with home, landing on the best achievable subset', () => {
    // ring 'fits' is on home's exact timezone/hours, so it's always
    // reconcilable; ring 'never-fits' is exactly 12h away on an identical
    // 9-18 workday -- the one offset where two 9h workdays (with +/-1h
    // stretch each) can never overlap even checking both the immediate and
    // following occurrence, verified independently across a 10-day scan
    const config: ClockConfig = {
      ...DEFAULT_CONFIG,
      home: { id: 'home', label: 'Home', timezoneId: 'UTC', color: '#38BDF8', workStart: 9, workEnd: 18 },
      rings: [
        { id: 'fits', label: 'Fits', timezoneId: 'UTC', color: '#FB7185', workStart: 9, workEnd: 18 },
        { id: 'never-fits', label: 'Never Fits', timezoneId: 'Etc/GMT-12', color: '#FBBF4B', workStart: 9, workEnd: 18 },
      ],
    };
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    renderApp();

    fireEvent.click(screen.getByTestId('control-find-time-button'));

    expect((screen.getByTestId('ring-include-checkbox-fits') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('ring-include-checkbox-never-fits') as HTMLInputElement).checked).toBe(false);
  });

  // regression: a ring that auto-excludes because it can never be reconciled
  // used to leave its checkbox fully interactive-looking, so re-checking it
  // just silently snapped back to unchecked a moment later -- indistinguishable
  // from a broken control. It should instead be disabled with a tooltip
  // explaining why, computed via App's unreachableRingReasonById.
  it('disables a checkbox with an explanatory tooltip for a ring that can never fit, but not for one that can', () => {
    const config: ClockConfig = {
      ...DEFAULT_CONFIG,
      home: { id: 'home', label: 'Home', timezoneId: 'UTC', color: '#38BDF8', workStart: 9, workEnd: 18 },
      rings: [
        { id: 'fits', label: 'Fits', timezoneId: 'UTC', color: '#FB7185', workStart: 9, workEnd: 18 },
        { id: 'never-fits', label: 'Never Fits', timezoneId: 'Etc/GMT-12', color: '#FBBF4B', workStart: 9, workEnd: 18 },
      ],
    };
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    renderApp();

    fireEvent.click(screen.getByTestId('control-find-time-button'));

    const fitsCheckbox = screen.getByTestId('ring-include-checkbox-fits') as HTMLInputElement;
    const neverFitsCheckbox = screen.getByTestId('ring-include-checkbox-never-fits') as HTMLInputElement;

    expect(fitsCheckbox.disabled).toBe(false);
    expect(fitsCheckbox.closest('label')?.getAttribute('title')).toBeNull();

    expect(neverFitsCheckbox.disabled).toBe(true);
    expect(neverFitsCheckbox.closest('label')?.getAttribute('title')).toMatch(/never fits/i);
  });

  // clicking a disabled checkbox is a native no-op (the browser never fires
  // onChange), but this locks in that expectation against a future change to
  // the disabled-check logic quietly making the click handler responsible instead
  it('does not toggle a disabled, never-fits checkbox when clicked', () => {
    const config: ClockConfig = {
      ...DEFAULT_CONFIG,
      home: { id: 'home', label: 'Home', timezoneId: 'UTC', color: '#38BDF8', workStart: 9, workEnd: 18 },
      rings: [
        { id: 'fits', label: 'Fits', timezoneId: 'UTC', color: '#FB7185', workStart: 9, workEnd: 18 },
        { id: 'never-fits', label: 'Never Fits', timezoneId: 'Etc/GMT-12', color: '#FBBF4B', workStart: 9, workEnd: 18 },
      ],
    };
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    renderApp();

    fireEvent.click(screen.getByTestId('control-find-time-button'));
    fireEvent.click(screen.getByTestId('ring-include-checkbox-never-fits'));

    expect((screen.getByTestId('ring-include-checkbox-never-fits') as HTMLInputElement).checked).toBe(false);
  });

  // regression: checking a ring that itself fits fine could still silently
  // uncheck a DIFFERENT, already-included ring, because findBestMeetingOffset
  // sweeps for a single best offset across the whole included set from
  // scratch on every toggle, rather than trying to keep the current one.
  // Reported live: checking New York (whose own window opens ~5h45m later)
  // shifted the search there and dropped Sydney, which had been fitting fine
  // at "now". New York's checkbox should be disabled with an explanation
  // instead of letting that swap happen silently.
  it('disables a ring whose inclusion would silently displace a different, already-fitting ring', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-22T07:15:00.000Z')); // ~10:15 IDT -- home mid-workday
    // user.click fires a real pointer sequence (unlike fireEvent.click, which
    // is just a bare 'click' event) -- it reaches useRingScrub's onPointerUp
    // on the clock container, since checkbox clicks only stopPropagation on
    // pointerDown, not pointerUp. jsdom doesn't implement the Pointer Capture
    // API at all, so stub it the same way ManageLocationsList's drag tests do.
    const originalHasPointerCapture = Element.prototype.hasPointerCapture;
    const originalSetPointerCapture = Element.prototype.setPointerCapture;
    const originalReleasePointerCapture = Element.prototype.releasePointerCapture;
    Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    try {
      const config: ClockConfig = {
        home: { id: 'tel-aviv', label: 'Tel Aviv', timezoneId: 'Asia/Jerusalem', color: '#38BDF8', workStart: 9, workEnd: 18 },
        rings: [
          { id: 'london', label: 'London', timezoneId: 'Europe/London', color: '#34D399', workStart: 9, workEnd: 18 },
          { id: 'sydney', label: 'Sydney', timezoneId: 'Australia/Sydney', color: '#A78BFA', workStart: 9, workEnd: 18 },
          { id: 'new-york', label: 'New York', timezoneId: 'America/New_York', color: '#FBBF4B', workStart: 9, workEnd: 18 },
        ],
        meetings: [],
      };
      window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
      renderApp();

      // the initial Find Time click sweeps all three rings together, and
      // New York (whose own window is open sooner in this composition) wins
      // that first sweep -- so Sydney starts out auto-excluded. Excluding New
      // York only removes it from the search; it doesn't automatically
      // re-include Sydney (auto-exclusion doesn't self-heal), so re-check it
      // explicitly to get to the state the report started from: London +
      // Sydney both fitting at "now".
      fireEvent.click(screen.getByTestId('control-find-time-button'));
      fireEvent.click(screen.getByTestId('ring-include-checkbox-new-york'));
      fireEvent.click(screen.getByTestId('ring-include-checkbox-sydney'));

      expect((screen.getByTestId('ring-include-checkbox-london') as HTMLInputElement).checked).toBe(true);
      expect((screen.getByTestId('ring-include-checkbox-sydney') as HTMLInputElement).checked).toBe(true);

      const nyCheckbox = screen.getByTestId('ring-include-checkbox-new-york') as HTMLInputElement;
      expect(nyCheckbox.checked).toBe(false);
      expect(nyCheckbox.disabled).toBe(true);
      expect(nyCheckbox.closest('label')?.getAttribute('title')).toMatch(/drop Sydney/i);

      // a disabled input is a native no-op -- clicking it anyway must not
      // toggle it or disturb Sydney's already-fitting checked state
      await user.click(nyCheckbox);
      expect(nyCheckbox.checked).toBe(false);
      expect((screen.getByTestId('ring-include-checkbox-sydney') as HTMLInputElement).checked).toBe(true);
    } finally {
      vi.useRealTimers();
      Element.prototype.hasPointerCapture = originalHasPointerCapture;
      Element.prototype.setPointerCapture = originalSetPointerCapture;
      Element.prototype.releasePointerCapture = originalReleasePointerCapture;
    }
  });
});

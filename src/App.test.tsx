import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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
  await user.click(screen.getByRole('button', { name: 'Menu' }));
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

    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
    expect(screen.getByTestId('scrub-cancel-button')).toBeTruthy();
    expect(screen.getByTestId('scrub-schedule-button')).toBeTruthy();
  });

  it('swaps to Cancel/Schedule on the first scrub in portrait too — same behavior as desktop', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    renderApp();

    await scrubForward(user);

    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
    expect(screen.getByTestId('scrub-cancel-button')).toBeTruthy();
    expect(screen.getByTestId('scrub-schedule-button')).toBeTruthy();
  });

  it('Cancel resets the scrub and restores the normal Config/Share menu', async () => {
    const user = userEvent.setup();
    renderApp();

    await scrubForward(user);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).not.toBe('0');

    await user.click(screen.getByTestId('scrub-cancel-button'));

    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByRole('button', { name: 'Menu' })).toBeTruthy();
  });

  it('Config is unreachable while a scrub preview is active (no way to leave a stale preview stuck behind it)', async () => {
    const user = userEvent.setup();
    renderApp();

    await scrubForward(user);

    expect(screen.queryByRole('button', { name: 'Config' })).toBeNull();
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
    await user.click(screen.getByRole('button', { name: 'Share' }));

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

    expect(screen.getByRole('button', { name: 'Remove Meeting' })).toBeTruthy();
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
    expect(screen.getByRole('button', { name: 'Remove Meeting' })).toBeTruthy();

    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');

    expect(screen.queryByRole('button', { name: 'Remove Meeting' })).toBeNull();
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

    expect(screen.queryByRole('button', { name: 'Remove Meeting' })).toBeNull();
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
    await user.click(screen.getByRole('button', { name: 'Remove Meeting' }));

    await waitFor(() => expect(googleCalendar.deleteMeetingFromGoogleCalendar).toHaveBeenCalledWith('evt-1'));
    await waitFor(() => expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0'));
    expect(await screen.findByText('Meeting removed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove Meeting' })).toBeNull();
    expect(analytics.trackEvent).toHaveBeenCalledWith('meeting_deleted');
  });

  it('removes a meeting with no googleEventId locally, without calling the Calendar API', async () => {
    seedConfigWithMeeting(new Date(Date.now() + 3 * 60_000).toISOString());
    const user = userEvent.setup();
    renderApp();

    await scrubOntoMeeting(user);
    await user.click(screen.getByRole('button', { name: 'Remove Meeting' }));

    await waitFor(() => expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0'));
    expect(googleCalendar.deleteMeetingFromGoogleCalendar).not.toHaveBeenCalled();
    expect(await screen.findByText('Meeting removed')).toBeTruthy();
  });

  it('shows an error toast and keeps the scrub preview when the Calendar delete fails', async () => {
    seedConfigWithMeeting(new Date(Date.now() + 3 * 60_000).toISOString(), 'evt-1');
    const deleteError = new Error('boom');
    vi.mocked(googleCalendar.deleteMeetingFromGoogleCalendar).mockRejectedValue(deleteError);
    const user = userEvent.setup();
    const { logger } = renderApp();

    await scrubOntoMeeting(user);
    await user.click(screen.getByRole('button', { name: 'Remove Meeting' }));

    expect(await screen.findByText('boom')).toBeTruthy();
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).not.toBe('0');
    expect(screen.getByRole('button', { name: 'Remove Meeting' })).toBeTruthy();
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
    await user.click(screen.getByRole('button', { name: 'Remove Meeting' }));
    await waitFor(() => expect(googleCalendar.deleteMeetingFromGoogleCalendar).toHaveBeenCalledTimes(1));

    screen.getByRole('slider').focus();
    await user.keyboard('{ArrowUp}');
    const offsetAfterFurtherScrub = screen.getByRole('slider').getAttribute('aria-valuenow');
    expect(offsetAfterFurtherScrub).not.toBe(offsetBeforeRemove);

    resolveDelete();
    expect(await screen.findByText('Meeting removed')).toBeTruthy();
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
    await user.click(screen.getByTestId('scrub-schedule-button'));

    await waitFor(() => expect(googleCalendar.scheduleMeetingOnGoogleCalendar).toHaveBeenCalledTimes(1));
    const [title, , durationMinutes] = vi.mocked(googleCalendar.scheduleMeetingOnGoogleCalendar).mock.calls[0];
    expect(title).toMatch(/^Overlap-Clock Meeting: /);
    expect(durationMinutes).toBe(30);

    await waitFor(() => expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0'));
    expect(await screen.findByText('Meeting scheduled')).toBeTruthy();
    expect(analytics.trackEvent).toHaveBeenCalledWith('meeting_scheduled', { duration_minutes: 30 });
  });

  it('shows an error toast and keeps the scrub preview (so the user can retry) when scheduling fails', async () => {
    stubMatchMedia(true);
    const scheduleError = new Error('boom');
    vi.mocked(googleCalendar.scheduleMeetingOnGoogleCalendar).mockRejectedValue(scheduleError);
    const user = userEvent.setup();
    const { logger } = renderApp();

    await scrubForward(user);
    await user.click(screen.getByTestId('scrub-schedule-button'));

    expect(await screen.findByText('boom')).toBeTruthy();
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).not.toBe('0');
    expect(screen.getByTestId('scrub-schedule-button')).toBeTruthy();
    expect(logger.error).toHaveBeenCalledWith(scheduleError, 'failed to quick-schedule a meeting from the scrub buttons');
  });

  it('Cancel resets the scrub preview without scheduling anything', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    renderApp();

    await scrubForward(user);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).not.toBe('0');

    await user.click(screen.getByTestId('scrub-cancel-button'));

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
    await user.click(screen.getByTestId('scrub-schedule-button'));
    await waitFor(() => expect(googleCalendar.scheduleMeetingOnGoogleCalendar).toHaveBeenCalledTimes(1));

    await scrubForward(user);
    const offsetAfterFurtherScrub = screen.getByRole('slider').getAttribute('aria-valuenow');
    expect(offsetAfterFurtherScrub).not.toBe(offsetBeforeSchedule);

    resolveSchedule('evt-1');
    expect(await screen.findByText('Meeting scheduled')).toBeTruthy();
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
    await user.click(screen.getByRole('button', { name: 'Config' }));

    expect(screen.getByText('Manage clock')).toBeTruthy();
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
    await user.click(screen.getByRole('button', { name: 'Config' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.queryByText('Manage clock')).toBeNull();
  });

  it('keeps the desktop floating accordion panel on non-portrait, unaffected', async () => {
    const user = userEvent.setup();
    renderApp();

    await openClusterMenu(user);
    await user.click(screen.getByRole('button', { name: 'Config' }));

    expect(screen.queryByText('Manage clock')).toBeNull();
    expect(screen.getByRole('button', { name: 'Manage locations' })).toBeTruthy();
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

  it('never shows if already marked as seen', () => {
    window.localStorage.setItem(SCRUB_HINT_SEEN_STORAGE_KEY, 'true');
    renderApp();
    expect(screen.queryByTestId('scrub-hint-dismiss-button')).toBeNull();
  });

  it('is removed from the DOM (not just hidden) and never reappears after Got it is clicked', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp();
    expect(screen.getByTestId('scrub-hint-dismiss-button')).toBeTruthy();

    await user.click(screen.getByTestId('scrub-hint-dismiss-button'));
    expect(screen.queryByTestId('scrub-hint-dismiss-button')).toBeNull();
    expect(window.localStorage.getItem(SCRUB_HINT_SEEN_STORAGE_KEY)).toBe('true');

    unmount();
    renderApp();
    expect(screen.queryByTestId('scrub-hint-dismiss-button')).toBeNull();
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

  it('reappears once activity resumes after an idle hide, if still unseen', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    try {
      renderApp();
      act(() => vi.advanceTimersByTime(DEFAULT_IDLE_TIMEOUT_MS));
      expect(screen.queryByTestId('scrub-hint-dismiss-button')).toBeNull();

      act(() => window.dispatchEvent(new Event('pointermove')));

      expect(screen.getByTestId('scrub-hint-dismiss-button')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

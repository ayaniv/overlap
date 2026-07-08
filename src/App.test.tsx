import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import * as googleCalendar from './clock/googleCalendar';
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from './hooks/useClockConfig';
import type { ClockConfig } from './clock/types';

vi.mock('./clock/googleCalendar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./clock/googleCalendar')>();
  return { ...actual, scheduleMeetingOnGoogleCalendar: vi.fn() };
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
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(googleCalendar.scheduleMeetingOnGoogleCalendar).mockReset();
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

describe('App — leaving schedule mode resets the scrub preview', () => {
  it('resets the scrub offset after switching to Config mode and back, not just via the form\'s own Cancel', async () => {
    const user = userEvent.setup();
    render(<App />);

    await scrubForward(user);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).not.toBe('0');

    // this path bypasses ScheduleForm's own Cancel entirely — clicking the config
    // cogwheel directly used to leave the scrub offset stuck, silently reapplied
    // once back in view mode
    await openClusterMenu(user);
    await user.click(screen.getByRole('button', { name: 'Config' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0');
  });

  it('resets the scrub offset when the Schedule icon toggles the panel closed', async () => {
    const user = userEvent.setup();
    render(<App />);

    await scrubForward(user);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).not.toBe('0');

    // the ControlCluster's Schedule icon-button, disambiguated from the form's own
    // "Schedule" submit button (same accessible name) via its title attribute
    await openClusterMenu(user);
    await user.click(screen.getByTitle('Schedule'));

    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0');
  });
});

describe('App — scrubbing auto-opens the schedule panel only outside portrait', () => {
  it('auto-opens the schedule panel on the first scrub in landscape/desktop', async () => {
    const user = userEvent.setup();
    render(<App />);

    await scrubForward(user);

    expect(screen.getByText('Schedule meeting')).toBeTruthy();
  });

  it('also expands the ControlCluster menu on the first scrub in landscape, so the active Schedule button is visible', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('false');

    await scrubForward(user);

    expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('does not auto-open the schedule panel on scrub in portrait', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    render(<App />);

    await scrubForward(user);

    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).not.toBe('0');
    expect(screen.queryByText('Schedule meeting')).toBeNull();
  });

  // superseded by ControlCluster's scrubActions swap (see "App — mobile
  // quick-schedule" below): a portrait scrub no longer leaves the icon menu
  // collapsed-but-present, it replaces it outright with Cancel/Schedule, so
  // there's no longer an "explicitly open the still-collapsed menu after
  // scrubbing" path to gate hasScrubbed against.
  it('replaces the ControlCluster icon menu with Cancel/Schedule on scrub in portrait, instead of merely leaving it collapsed', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    render(<App />);

    await scrubForward(user);

    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
    expect(screen.getByText('Cancel')).toBeTruthy();
    expect(screen.getByText('Schedule')).toBeTruthy();
  });
});

// matchedMeeting is computed via useMemo (App.tsx) keyed on the previewed instant —
// these exercise that it still recomputes correctly as the scrub preview moves,
// rather than getting stuck on a stale value (the main risk a bad memo dependency
// list would introduce).
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

  it('surfaces the meeting once the preview lands within the match tolerance', async () => {
    seedConfigWithMeeting(new Date(Date.now() + 3 * 60_000).toISOString());
    const user = userEvent.setup();
    render(<App />);

    const slider = screen.getByRole('slider');
    slider.focus();
    for (let step = 0; step < 3; step += 1) {
      await user.keyboard('{ArrowUp}');
    }

    expect(screen.getByText('Design sync')).toBeTruthy();
  });

  it('stops surfacing the meeting once scrubbed back out of the match tolerance', async () => {
    seedConfigWithMeeting(new Date(Date.now() + 3 * 60_000).toISOString());
    const user = userEvent.setup();
    render(<App />);

    const slider = screen.getByRole('slider');
    slider.focus();
    for (let step = 0; step < 3; step += 1) {
      await user.keyboard('{ArrowUp}');
    }
    expect(screen.getByText('Design sync')).toBeTruthy();

    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');

    expect(screen.queryByText('Design sync')).toBeNull();
  });

  it('does not surface the meeting when this browser has never connected to Google Calendar', async () => {
    window.localStorage.removeItem('overlap:google-connected:v1');
    seedConfigWithMeeting(new Date(Date.now() + 3 * 60_000).toISOString());
    const user = userEvent.setup();
    render(<App />);

    const slider = screen.getByRole('slider');
    slider.focus();
    for (let step = 0; step < 3; step += 1) {
      await user.keyboard('{ArrowUp}');
    }

    expect(screen.queryByText('Design sync')).toBeNull();
  });
});

// mobile quick-schedule: on portrait, scrubbing swaps ControlCluster's icon menu
// for Cancel/Schedule (see WorldClock's isScrubActionBarVisible); Schedule skips
// ScheduleForm entirely and schedules straight to Google Calendar
describe('App — mobile quick-schedule (ControlCluster scrub buttons)', () => {
  it('swaps in Cancel/Schedule instead of the icon menu once scrubbed in portrait', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    render(<App />);

    await scrubForward(user);

    expect(screen.getByText('Cancel')).toBeTruthy();
    expect(screen.getByText('Schedule')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Config' })).toBeNull();
  });

  it('schedules a 30-minute meeting with an auto-generated overlap title, then resets the scrub and shows a toast', async () => {
    stubMatchMedia(true);
    vi.mocked(googleCalendar.scheduleMeetingOnGoogleCalendar).mockResolvedValue('evt-1');
    const user = userEvent.setup();
    render(<App />);

    await scrubForward(user);
    await user.click(screen.getByText('Schedule'));

    await waitFor(() => expect(googleCalendar.scheduleMeetingOnGoogleCalendar).toHaveBeenCalledTimes(1));
    const [title, , durationMinutes] = vi.mocked(googleCalendar.scheduleMeetingOnGoogleCalendar).mock.calls[0];
    expect(title).toMatch(/^Overlap-Clock Meeting: /);
    expect(durationMinutes).toBe(30);

    await waitFor(() => expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0'));
    expect(await screen.findByText('Meeting scheduled')).toBeTruthy();
  });

  it('shows an error toast and keeps the scrub preview (so the user can retry) when scheduling fails', async () => {
    stubMatchMedia(true);
    vi.mocked(googleCalendar.scheduleMeetingOnGoogleCalendar).mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    render(<App />);

    await scrubForward(user);
    await user.click(screen.getByText('Schedule'));

    expect(await screen.findByText('boom')).toBeTruthy();
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).not.toBe('0');
    expect(screen.getByText('Schedule')).toBeTruthy();
  });

  it('Cancel resets the scrub preview without scheduling anything', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    render(<App />);

    await scrubForward(user);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).not.toBe('0');

    await user.click(screen.getByText('Cancel'));

    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0');
    expect(googleCalendar.scheduleMeetingOnGoogleCalendar).not.toHaveBeenCalled();
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
    render(<App />);

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
    render(<App />);

    await openClusterMenu(user);
    await user.click(screen.getByRole('button', { name: 'Config' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.queryByText('Manage clock')).toBeNull();
  });

  it('keeps the desktop floating accordion panel on non-portrait, unaffected', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openClusterMenu(user);
    await user.click(screen.getByRole('button', { name: 'Config' }));

    expect(screen.queryByText('Manage clock')).toBeNull();
    expect(screen.getByRole('button', { name: 'Manage locations' })).toBeTruthy();
  });
});

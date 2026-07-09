import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsProvider } from './analytics/AnalyticsProvider';
import { createMockAnalyticsService } from './analytics/mockAnalyticsService';
import App from './App';
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from './hooks/useClockConfig';
import type { ClockConfig } from './clock/types';

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

function renderApp(service = createMockAnalyticsService()) {
  render(
    <AnalyticsProvider service={service}>
      <App />
    </AnalyticsProvider>,
  );
  return service;
}

describe('App — leaving schedule mode resets the scrub preview', () => {
  it('resets the scrub offset after switching to Config mode and back, not just via the form\'s own Cancel', async () => {
    const user = userEvent.setup();
    renderApp();

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
    renderApp();

    await scrubForward(user);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).not.toBe('0');

    // the ControlCluster's Schedule icon-button, disambiguated from the form's own
    // "Schedule" submit button (same accessible name) via its title attribute
    await openClusterMenu(user);
    await user.click(screen.getByTitle('Schedule'));

    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0');
  });
});

describe('App — sharing fires an analytics event with the outcome', () => {
  it('fires clock_shared with the share outcome when the Share button is clicked', async () => {
    // jsdom implements neither navigator.share nor navigator.clipboard; stubbing
    // clipboard only (no .share) forces the deterministic "copied" fallback path
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const user = userEvent.setup();
    const analytics = renderApp();

    await openClusterMenu(user);
    await user.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('clock_shared', { outcome: 'copied' }));
  });
});

describe('App — scrubbing auto-opens the schedule panel only outside portrait', () => {
  it('auto-opens the schedule panel on the first scrub in landscape/desktop', async () => {
    const user = userEvent.setup();
    const analytics = renderApp();

    await scrubForward(user);

    expect(screen.getByText('Schedule meeting')).toBeTruthy();
    expect(analytics.trackEvent).toHaveBeenCalledWith('schedule_form_opened');
  });

  it('also expands the ControlCluster menu on the first scrub in landscape, so the active Schedule button is visible', async () => {
    const user = userEvent.setup();
    renderApp();

    expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('false');

    await scrubForward(user);

    expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('does not auto-open the schedule panel on scrub in portrait', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    renderApp();

    await scrubForward(user);

    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).not.toBe('0');
    expect(screen.queryByText('Schedule meeting')).toBeNull();
  });

  it('does not auto-open the ControlCluster menu on scrub in portrait either', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    renderApp();

    await scrubForward(user);

    expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('a portrait scrub still counts toward hasScrubbed, so explicitly opening Schedule afterward is not gated', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    renderApp();

    await scrubForward(user);
    await openClusterMenu(user);
    await user.click(screen.getByTitle('Schedule'));

    const titleInput = screen.getByLabelText('Meeting title') as HTMLInputElement;
    expect(titleInput.closest('fieldset')?.disabled).toBe(false);
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
    renderApp();

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
    renderApp();

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
    renderApp();

    const slider = screen.getByRole('slider');
    slider.focus();
    for (let step = 0; step < 3; step += 1) {
      await user.keyboard('{ArrowUp}');
    }

    expect(screen.queryByText('Design sync')).toBeNull();
  });
});

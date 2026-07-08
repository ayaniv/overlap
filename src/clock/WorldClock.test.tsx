import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorldClock } from './WorldClock';
import { MS_PER_HOUR, meetingAngle, pointOnCircle, ringRadius } from './geometry';
import { DEFAULT_IDLE_TIMEOUT_MS } from '../hooks/useIsIdle';
import type { RingScrubBind } from './useRingScrub';
import type { Location, Meeting, Mode } from './types';

// useSweepAngle reads window.matchMedia, which jsdom doesn't implement
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const HOME: Location = { id: 'tel-aviv', label: 'Tel Aviv', timezoneId: 'Asia/Jerusalem', color: '#38BDF8', workStart: 9, workEnd: 18 };
const SF: Location = { id: 'san-francisco', label: 'San Francisco', timezoneId: 'America/Los_Angeles', color: '#FB7185', workStart: 9, workEnd: 18 };
const NOW = new Date('2026-01-01T12:00:00.000Z');

function renderClock(mode: Mode, rings: Location[] = [SF], meetings: Meeting[] = []) {
  const onRemoveLocation = vi.fn();
  render(
    <WorldClock
      now={NOW}
      home={HOME}
      rings={rings}
      meetings={meetings}
      mode={mode}
      onSetMode={vi.fn()}
      isMenuExpanded={false}
      onMenuExpandedChange={vi.fn()}
      onShare={vi.fn()}
      onRemoveLocation={onRemoveLocation}
      onReorder={vi.fn()}
    />,
  );
  return { onRemoveLocation };
}

const SCRUB_BIND: RingScrubBind = {
  onPointerDown: vi.fn(),
  onPointerMove: vi.fn(),
  onPointerUp: vi.fn(),
  onKeyDown: vi.fn(),
};

// removing a location is now exclusively a ManageLocationsList affordance
// (see ManageLocationsList.test.tsx) — WorldClock no longer renders its own
// on-ring remove control

function renderClockWithPanel(mode: Mode, onReorder = vi.fn(), overrides: Partial<{ isPortrait: boolean; onSetMode: (mode: Mode) => void }> = {}) {
  render(
    <WorldClock
      now={NOW}
      home={HOME}
      rings={[SF]}
      meetings={[]}
      mode={mode}
      onSetMode={vi.fn()}
      isMenuExpanded={false}
      onMenuExpandedChange={vi.fn()}
      onShare={vi.fn()}
      onRemoveLocation={vi.fn()}
      onReorder={onReorder}
      modePanelContent={<div>Form</div>}
      {...overrides}
    />,
  );
}

describe('WorldClock manage-locations list', () => {
  it('lists home first, then rings, once the Manage locations accordion section is opened', async () => {
    const user = userEvent.setup();
    renderClockWithPanel('edit');

    await user.click(screen.getByRole('button', { name: 'Manage locations' }));

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Tel Aviv');
    expect(rows[1].textContent).toContain('San Francisco');
  });

  it('threads onReorder through to the list (reorder mechanics covered by ManageLocationsList.test.tsx)', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    renderClockWithPanel('edit', onReorder);

    await user.click(screen.getByRole('button', { name: 'Manage locations' }));

    expect(screen.getByRole('button', { name: 'Reorder San Francisco' })).toBeTruthy();
  });

  it('is not rendered outside edit mode, even with a mode panel present', () => {
    renderClockWithPanel('schedule');
    expect(screen.queryByRole('listitem')).toBeNull();
  });
});

// mobile Config view: the desktop floating ConfigPanel (position: absolute, no
// scroll container) could get its Add/Manage-locations content pushed off-screen
// by the on-screen keyboard with no way back — MobileConfigView replaces it
// wholesale on portrait with a real scrollable page showing both sections at once
describe('WorldClock mobile Config view (isPortrait)', () => {
  it('renders MobileConfigView instead of the floating ConfigPanel when isPortrait and in edit mode', () => {
    renderClockWithPanel('edit', vi.fn(), { isPortrait: true });

    expect(screen.getByText('Manage clock')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });

  it('shows both sections at once, with no accordion toggle needed to reach Manage locations', () => {
    renderClockWithPanel('edit', vi.fn(), { isPortrait: true });

    expect(screen.getByText('Form')).toBeTruthy(); // the addLocationContent passed in
    expect(screen.getAllByRole('listitem')).toHaveLength(2); // Manage locations rows, visible without any click
    expect(screen.queryByRole('button', { name: 'Manage locations' })).toBeNull(); // no accordion header here
  });

  it('calls onSetMode("view") when Done is tapped', async () => {
    const user = userEvent.setup();
    const onSetMode = vi.fn();
    renderClockWithPanel('edit', vi.fn(), { isPortrait: true, onSetMode });

    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(onSetMode).toHaveBeenCalledWith('view');
  });

  it('still uses the desktop accordion ConfigPanel when isPortrait is false (default)', () => {
    renderClockWithPanel('edit');

    expect(screen.queryByText('Manage clock')).toBeNull();
    expect(screen.getByRole('button', { name: 'Manage locations' })).toBeTruthy();
    expect(screen.queryByRole('listitem')).toBeNull(); // collapsed by default, behind the accordion
  });

  it('does not affect the schedule panel — modePanelContent renders directly regardless of isPortrait', () => {
    renderClockWithPanel('schedule', vi.fn(), { isPortrait: true });

    expect(screen.getByText('Form')).toBeTruthy();
    expect(screen.queryByText('Manage clock')).toBeNull();
  });
});

describe('WorldClock scrub slider', () => {
  it('has no slider role when scrubBind is not provided', () => {
    renderClock('view');
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('exposes a complete ARIA slider when scrubBind is provided', () => {
    render(
      <WorldClock
        now={NOW}
        home={HOME}
        rings={[SF]}
        meetings={[]}
        mode="view"
        onSetMode={vi.fn()}
        isMenuExpanded={false}
        onMenuExpandedChange={vi.fn()}
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        onReorder={vi.fn()}
        previewOffsetMs={2 * MS_PER_HOUR}
        scrubBind={SCRUB_BIND}
      />,
    );

    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuenow')).toBe(String(2 * MS_PER_HOUR));
    expect(slider.getAttribute('aria-valuemin')).toBe(String(-24 * MS_PER_HOUR));
    expect(slider.getAttribute('aria-valuemax')).toBe(String(24 * MS_PER_HOUR));
    expect(slider.getAttribute('aria-valuetext')).toBeTruthy();
  });

  it('clamps aria-valuenow to aria-valuemin/aria-valuemax, since the raw offset itself is never clamped', () => {
    render(
      <WorldClock
        now={NOW}
        home={HOME}
        rings={[SF]}
        meetings={[]}
        mode="view"
        onSetMode={vi.fn()}
        isMenuExpanded={false}
        onMenuExpandedChange={vi.fn()}
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        onReorder={vi.fn()}
        previewOffsetMs={100 * MS_PER_HOUR}
        scrubBind={SCRUB_BIND}
      />,
    );

    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuenow')).toBe(String(24 * MS_PER_HOUR));
  });

  it('clamps a large negative offset to aria-valuemin', () => {
    render(
      <WorldClock
        now={NOW}
        home={HOME}
        rings={[SF]}
        meetings={[]}
        mode="view"
        onSetMode={vi.fn()}
        isMenuExpanded={false}
        onMenuExpandedChange={vi.fn()}
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        onReorder={vi.fn()}
        previewOffsetMs={-100 * MS_PER_HOUR}
        scrubBind={SCRUB_BIND}
      />,
    );

    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuenow')).toBe(String(-24 * MS_PER_HOUR));
  });
});

describe('WorldClock copy', () => {
  it('shows the current top-of-page branding and an accurate status line, without a global working-hours legend', () => {
    renderClock('view');

    expect(screen.getByText('See shared hours instantly')).toBeTruthy();
    expect(screen.getByText((_, node) => node?.textContent === 'Overlap Clock')).toBeTruthy();
    // per-location working hours are per-ring, so no single "Home working hours" line
    expect(screen.queryByText(/Home working hours/)).toBeNull();
  });

  it('phrases the status line as a single "N/M teams available • local working hours" line, using the real computed count', () => {
    renderClock('view', [SF]); // SF is out of its working hours at NOW (12:00 UTC -> 04:00 PT); home (Tel Aviv) is in hours
    expect(screen.getByText('1/2 teams available • local working hours')).toBeTruthy();
  });

  it('recomputes the count from the actual ring list instead of a hardcoded total', () => {
    const SYDNEY: Location = { id: 'sydney', label: 'Sydney', timezoneId: 'Australia/Sydney', color: '#A78BFA', workStart: 9, workEnd: 18 };
    renderClock('view', [SF, SYDNEY]); // SF and Sydney are both out of hours at NOW; only home is in hours
    expect(screen.getByText('1/3 teams available • local working hours')).toBeTruthy();
  });
});

// mobile quick-schedule (ControlCluster's scrubActions swap): the only surfaced
// schedule/cancel affordance while portrait scrubbing keeps mode at 'view' (see
// App.tsx's markScrubbed) — desktop never sees this (mode leaves 'view' immediately
// there), so these tests exercise the underlying render/wiring logic directly,
// independent of viewport. ControlCluster's own tests cover the swapped markup in
// isolation; these cover WorldClock actually passing scrubActions through at the
// right moment.
describe('WorldClock mobile quick-schedule (ControlCluster swap)', () => {
  function renderScrubbedClock(onQuickSchedule = vi.fn(), onBackToNow = vi.fn(), previewOffsetMs = MS_PER_HOUR, isQuickScheduling = false) {
    render(
      <WorldClock
        now={NOW}
        home={HOME}
        rings={[SF]}
        meetings={[]}
        mode="view"
        onSetMode={vi.fn()}
        isMenuExpanded={false}
        onMenuExpandedChange={vi.fn()}
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        onReorder={vi.fn()}
        previewOffsetMs={previewOffsetMs}
        scrubBind={SCRUB_BIND}
        onQuickSchedule={onQuickSchedule}
        onBackToNow={onBackToNow}
        isQuickScheduling={isQuickScheduling}
      />,
    );
    return { onQuickSchedule, onBackToNow };
  }

  it('is absent before any scrub (previewOffsetMs is 0) — the normal icon menu shows instead', () => {
    renderScrubbedClock(vi.fn(), vi.fn(), 0);
    expect(screen.queryByText('Cancel')).toBeNull();
    expect(screen.getByRole('button', { name: 'Config' })).toBeTruthy();
  });

  it('swaps in Cancel/Schedule once scrubbed, in view mode, replacing the icon menu', () => {
    renderScrubbedClock();
    expect(screen.getByText('Cancel')).toBeTruthy();
    expect(screen.getByText('Schedule')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Config' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });

  it('calls onQuickSchedule when Schedule is tapped', async () => {
    const user = userEvent.setup();
    const { onQuickSchedule } = renderScrubbedClock();

    await user.click(screen.getByText('Schedule'));

    expect(onQuickSchedule).toHaveBeenCalledTimes(1);
  });

  it('calls onBackToNow when Cancel is tapped', async () => {
    const user = userEvent.setup();
    const { onBackToNow } = renderScrubbedClock();

    await user.click(screen.getByText('Cancel'));

    expect(onBackToNow).toHaveBeenCalledTimes(1);
  });

  it('reflects an in-flight quick-schedule as a disabled "Scheduling…" state', () => {
    renderScrubbedClock(vi.fn(), vi.fn(), MS_PER_HOUR, true);

    const scheduleButton = screen.getByText('Scheduling…') as HTMLButtonElement;
    expect(scheduleButton.disabled).toBe(true);
    expect((screen.getByText('Cancel') as HTMLButtonElement).disabled).toBe(true);
  });

  it('is hidden once schedule mode is entered, deferring to ScheduleForm’s own Cancel/Schedule', () => {
    render(
      <WorldClock
        now={NOW}
        home={HOME}
        rings={[SF]}
        meetings={[]}
        mode="schedule"
        onSetMode={vi.fn()}
        isMenuExpanded={false}
        onMenuExpandedChange={vi.fn()}
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        onReorder={vi.fn()}
        previewOffsetMs={MS_PER_HOUR}
        scrubBind={SCRUB_BIND}
        onQuickSchedule={vi.fn()}
        onBackToNow={vi.fn()}
      />,
    );

    expect(screen.queryByText('Cancel')).toBeNull();
    expect(screen.getByRole('button', { name: 'Config' })).toBeTruthy();
  });
});

const MEETING: Meeting = { id: 'meeting-1', title: 'Sync', startISO: '2026-01-01T13:00:00.000Z' };

describe('WorldClock meeting dot', () => {
  it('sits at meetingAngle(instant, now) on the home ring when there is no scrub preview', () => {
    const { container } = render(
      <WorldClock
        now={NOW}
        home={HOME}
        rings={[SF]}
        meetings={[MEETING]}
        mode="view"
        onSetMode={vi.fn()}
        isMenuExpanded={false}
        onMenuExpandedChange={vi.fn()}
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        onReorder={vi.fn()}
        isGoogleCalendarConnected
      />,
    );

    const dot = container.querySelector('circle[r="6"]');
    expect(dot).toBeTruthy();
    const homeRadius = ringRadius(1, 2); // [SF, home] -> home is the last of 2 rings
    const expected = pointOnCircle(homeRadius, meetingAngle(new Date(MEETING.startISO), NOW));
    expect(Number(dot?.getAttribute('cx'))).toBeCloseTo(expected.x, 1);
    expect(Number(dot?.getAttribute('cy'))).toBeCloseTo(expected.y, 1);
  });

  it('moves with the scrub preview, staying attached to the ring instead of a fixed screen position', () => {
    const previewOffsetMs = 2 * MS_PER_HOUR;
    const { container } = render(
      <WorldClock
        now={NOW}
        home={HOME}
        rings={[SF]}
        meetings={[MEETING]}
        mode="view"
        onSetMode={vi.fn()}
        isMenuExpanded={false}
        onMenuExpandedChange={vi.fn()}
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        onReorder={vi.fn()}
        previewOffsetMs={previewOffsetMs}
        scrubBind={SCRUB_BIND}
        isGoogleCalendarConnected
      />,
    );

    const dot = container.querySelector('circle[r="6"]');
    const homeRadius = ringRadius(1, 2);
    const effectiveNow = new Date(NOW.getTime() + previewOffsetMs);
    const expected = pointOnCircle(homeRadius, meetingAngle(new Date(MEETING.startISO), effectiveNow));
    expect(Number(dot?.getAttribute('cx'))).toBeCloseTo(expected.x, 1);
    expect(Number(dot?.getAttribute('cy'))).toBeCloseTo(expected.y, 1);

    // sanity: the preview really did move it from the unscrubbed position
    const unscrubbed = pointOnCircle(homeRadius, meetingAngle(new Date(MEETING.startISO), NOW));
    expect(expected.x).not.toBeCloseTo(unscrubbed.x, 1);
  });

  const MEETING_TOMORROW: Meeting = { id: 'meeting-2', title: 'Later', startISO: '2026-01-02T13:00:00.000Z' };

  it('hides the dot when the meeting falls on a different date (home timezone) than the one being viewed', () => {
    const { container } = render(
      <WorldClock
        now={NOW}
        home={HOME}
        rings={[SF]}
        meetings={[MEETING_TOMORROW]}
        mode="view"
        onSetMode={vi.fn()}
        isMenuExpanded={false}
        onMenuExpandedChange={vi.fn()}
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        onReorder={vi.fn()}
        isGoogleCalendarConnected
      />,
    );

    expect(container.querySelector('circle[r="6"]')).toBeNull();
  });

  it('shows the dot once scrubbed forward onto the meeting\'s date', () => {
    const { container } = render(
      <WorldClock
        now={NOW}
        home={HOME}
        rings={[SF]}
        meetings={[MEETING_TOMORROW]}
        mode="view"
        onSetMode={vi.fn()}
        isMenuExpanded={false}
        onMenuExpandedChange={vi.fn()}
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        onReorder={vi.fn()}
        previewOffsetMs={24 * MS_PER_HOUR}
        scrubBind={SCRUB_BIND}
        isGoogleCalendarConnected
      />,
    );

    expect(container.querySelector('circle[r="6"]')).toBeTruthy();
  });

  it('hides every meeting dot when not connected to Google Calendar, even on the right date', () => {
    const { container } = render(
      <WorldClock
        now={NOW}
        home={HOME}
        rings={[SF]}
        meetings={[MEETING]}
        mode="view"
        onSetMode={vi.fn()}
        isMenuExpanded={false}
        onMenuExpandedChange={vi.fn()}
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        onReorder={vi.fn()}
        isGoogleCalendarConnected={false}
      />,
    );

    expect(container.querySelector('circle[r="6"]')).toBeNull();
  });

  it('defaults to hidden when isGoogleCalendarConnected is not passed at all', () => {
    const { container } = render(
      <WorldClock
        now={NOW}
        home={HOME}
        rings={[SF]}
        meetings={[MEETING]}
        mode="view"
        onSetMode={vi.fn()}
        isMenuExpanded={false}
        onMenuExpandedChange={vi.fn()}
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(container.querySelector('circle[r="6"]')).toBeNull();
  });
});

describe('WorldClock ambient idle mode', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks the stage data-chrome-hidden after DEFAULT_IDLE_TIMEOUT_MS of no activity, in view mode', () => {
    vi.useFakeTimers();
    const { container } = render(
      <WorldClock
        now={NOW}
        home={HOME}
        rings={[SF]}
        meetings={[]}
        mode="view"
        onSetMode={vi.fn()}
        isMenuExpanded={false}
        onMenuExpandedChange={vi.fn()}
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        onReorder={vi.fn()}
      />,
    );
    const stage = container.querySelector('section');
    expect(stage?.hasAttribute('data-chrome-hidden')).toBe(false);

    act(() => vi.advanceTimersByTime(DEFAULT_IDLE_TIMEOUT_MS));

    expect(stage?.hasAttribute('data-chrome-hidden')).toBe(true);
  });

  it('does not mark data-chrome-hidden while a panel is open (mode !== view)', () => {
    vi.useFakeTimers();
    const { container } = render(
      <WorldClock
        now={NOW}
        home={HOME}
        rings={[SF]}
        meetings={[]}
        mode="schedule"
        onSetMode={vi.fn()}
        isMenuExpanded={false}
        onMenuExpandedChange={vi.fn()}
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    act(() => vi.advanceTimersByTime(DEFAULT_IDLE_TIMEOUT_MS));

    const stage = container.querySelector('section');
    expect(stage?.hasAttribute('data-chrome-hidden')).toBe(false);
  });

  it('clears data-chrome-hidden immediately on activity (e.g. a keydown)', () => {
    vi.useFakeTimers();
    const { container } = render(
      <WorldClock
        now={NOW}
        home={HOME}
        rings={[SF]}
        meetings={[]}
        mode="view"
        onSetMode={vi.fn()}
        isMenuExpanded={false}
        onMenuExpandedChange={vi.fn()}
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        onReorder={vi.fn()}
      />,
    );
    const stage = container.querySelector('section');

    act(() => vi.advanceTimersByTime(DEFAULT_IDLE_TIMEOUT_MS));
    expect(stage?.hasAttribute('data-chrome-hidden')).toBe(true);

    act(() => window.dispatchEvent(new Event('keydown')));

    expect(stage?.hasAttribute('data-chrome-hidden')).toBe(false);
  });
});

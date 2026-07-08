import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorldClock } from './WorldClock';
import { MS_PER_HOUR, meetingAngle, pointOnCircle, ringRadius } from './geometry';
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

function renderClockWithPanel(mode: Mode, onReorder = vi.fn()) {
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

  it('phrases the status line as "N of M teams are available now"', () => {
    renderClock('view', [SF]); // SF is out of its working hours at NOW (12:00 UTC -> 04:00 PT)
    const matches = screen.getAllByText(/teams are available now|No teams available right now/);
    expect(matches.length).toBeGreaterThan(0);
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

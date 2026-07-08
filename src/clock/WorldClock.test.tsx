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
      onShare={vi.fn()}
      onRemoveLocation={onRemoveLocation}
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

describe('WorldClock remove button', () => {
  it('shows no remove buttons in view mode', () => {
    renderClock('view');
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
  });

  it('shows a remove button for a non-home ring in edit mode', () => {
    renderClock('edit');
    expect(screen.getByRole('button', { name: 'Remove San Francisco' })).toBeTruthy();
  });

  it('never shows a remove button for the home ring, even in edit mode', () => {
    renderClock('edit');
    expect(screen.queryByRole('button', { name: 'Remove Tel Aviv' })).toBeNull();
  });

  it('calls onRemoveLocation with the ring id when clicked', async () => {
    const user = userEvent.setup();
    const { onRemoveLocation } = renderClock('edit');

    await user.click(screen.getByRole('button', { name: 'Remove San Francisco' }));

    expect(onRemoveLocation).toHaveBeenCalledTimes(1);
    expect(onRemoveLocation).toHaveBeenCalledWith('san-francisco');
  });

  it('calls onRemoveLocation on Enter', async () => {
    const user = userEvent.setup();
    const { onRemoveLocation } = renderClock('edit');

    screen.getByRole('button', { name: 'Remove San Francisco' }).focus();
    await user.keyboard('{Enter}');

    expect(onRemoveLocation).toHaveBeenCalledWith('san-francisco');
  });

  it('calls onRemoveLocation on Space', async () => {
    const user = userEvent.setup();
    const { onRemoveLocation } = renderClock('edit');

    screen.getByRole('button', { name: 'Remove San Francisco' }).focus();
    await user.keyboard(' ');

    expect(onRemoveLocation).toHaveBeenCalledWith('san-francisco');
  });

  it('does not call onRemoveLocation on unrelated keys', async () => {
    const user = userEvent.setup();
    const { onRemoveLocation } = renderClock('edit');

    screen.getByRole('button', { name: 'Remove San Francisco' }).focus();
    await user.keyboard('{Escape}');

    expect(onRemoveLocation).not.toHaveBeenCalled();
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
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
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
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
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
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        previewOffsetMs={previewOffsetMs}
        scrubBind={SCRUB_BIND}
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
});

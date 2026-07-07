import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorldClock } from './WorldClock';
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
      onReorder={vi.fn()}
    />,
  );
  return { onRemoveLocation };
}

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

function renderClockWithPanel(mode: Mode, onReorder = vi.fn()) {
  render(
    <WorldClock
      now={NOW}
      home={HOME}
      rings={[SF]}
      meetings={[]}
      mode={mode}
      onSetMode={vi.fn()}
      onShare={vi.fn()}
      onRemoveLocation={vi.fn()}
      onReorder={onReorder}
      modePanelContent={<div>Form</div>}
    />,
  );
}

describe('WorldClock manage-locations list', () => {
  it('lists home first, then rings, while in edit mode', () => {
    renderClockWithPanel('edit');
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Tel Aviv');
    expect(rows[1].textContent).toContain('San Francisco');
  });

  it('calls onReorder with the current home+rings ids when a row is moved', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    renderClockWithPanel('edit', onReorder);

    await user.click(screen.getByRole('button', { name: 'Move San Francisco up' }));

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(['san-francisco', 'tel-aviv']);
  });

  it('is not rendered outside edit mode, even with a mode panel present', () => {
    renderClockWithPanel('schedule');
    expect(screen.queryByRole('listitem')).toBeNull();
  });
});

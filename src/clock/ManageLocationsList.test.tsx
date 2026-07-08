import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManageLocationsList } from './ManageLocationsList';
import type { Location } from './types';

const ROW_HEIGHT = 40;
const rowTop = (index: number) => index * ROW_HEIGHT;
const rowCenter = (index: number) => rowTop(index) + ROW_HEIGHT / 2;

beforeEach(() => {
  // jsdom implements neither pointer capture nor real layout. Pointer capture is
  // stubbed as a no-op (so setPointerCapture/hasPointerCapture/releasePointerCapture
  // don't throw); each row's rect is derived from its *live* position among its DOM
  // siblings, so a row's measured center reflects whatever order the drag has
  // already applied to the DOM — matching what a real layout reflow would report.
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(true);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const index = this.parentElement ? Array.from(this.parentElement.children).indexOf(this) : 0;
    return {
      top: rowTop(index),
      bottom: rowTop(index) + ROW_HEIGHT,
      height: ROW_HEIGHT,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: rowTop(index),
      toJSON: () => ({}),
    } as DOMRect;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const HOME: Location = { id: 'tel-aviv', label: 'Tel Aviv', timezoneId: 'Asia/Jerusalem', color: '#38BDF8', workStart: 9, workEnd: 18 };
const SF: Location = { id: 'san-francisco', label: 'San Francisco', timezoneId: 'America/Los_Angeles', color: '#FB7185', workStart: 9, workEnd: 18 };
const NY: Location = { id: 'new-york', label: 'New York', timezoneId: 'America/New_York', color: '#FBBF4B', workStart: 9, workEnd: 18 };

// inside -> outside: home first, then rings from innermost to outermost
const LOCATIONS = [
  { ...HOME, isHome: true },
  { ...SF, isHome: false },
  { ...NY, isHome: false },
];

function dragHandleFor(label: string) {
  return screen.getByRole('button', { name: `Reorder ${label}` });
}

function drag(handle: HTMLElement, fromY: number, toY: number) {
  fireEvent.pointerDown(handle, { clientY: fromY, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientY: toY, pointerId: 1 });
  fireEvent.pointerUp(handle, { clientY: toY, pointerId: 1 });
}

describe('ManageLocationsList', () => {
  it('renders one row per location, inside->outside, with a home icon on the first row only', () => {
    render(<ManageLocationsList locations={LOCATIONS} onReorder={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByLabelText('Home')).toBeTruthy();
    expect(within(rows[0]).getByText('Tel Aviv')).toBeTruthy();
    expect(within(rows[1]).queryByLabelText('Home')).toBeNull();
    expect(within(rows[1]).getByText('San Francisco')).toBeTruthy();
    expect(within(rows[2]).getByText('New York')).toBeTruthy();
  });

  it('has no remove button on the home row, and a working remove button on other rows', () => {
    const onRemove = vi.fn();
    render(<ManageLocationsList locations={LOCATIONS} onReorder={vi.fn()} onRemove={onRemove} onClose={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Remove Tel Aviv' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove San Francisco' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith('san-francisco');
  });

  it('dragging a ring down past its outward neighbor swaps them, keeping home in place', () => {
    const onReorder = vi.fn();
    render(<ManageLocationsList locations={LOCATIONS} onReorder={onReorder} onRemove={vi.fn()} onClose={vi.fn()} />);

    // San Francisco (row 1) dragged past New York's (row 2) center
    drag(dragHandleFor('San Francisco'), rowCenter(1), rowCenter(2) + 1);

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(['tel-aviv', 'new-york', 'san-francisco']);
  });

  it('dragging a ring up past home promotes it to home', () => {
    const onReorder = vi.fn();
    render(<ManageLocationsList locations={LOCATIONS} onReorder={onReorder} onRemove={vi.fn()} onClose={vi.fn()} />);

    // San Francisco (row 1) dragged above Tel Aviv's (row 0) center
    drag(dragHandleFor('San Francisco'), rowCenter(1), 0);

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(['san-francisco', 'tel-aviv', 'new-york']);
  });

  it('does not call onReorder when the drag ends back at the original position', () => {
    const onReorder = vi.fn();
    render(<ManageLocationsList locations={LOCATIONS} onReorder={onReorder} onRemove={vi.fn()} onClose={vi.fn()} />);

    drag(dragHandleFor('San Francisco'), rowCenter(1), rowCenter(1));

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('does not call onReorder for a plain click with no pointer movement', () => {
    const onReorder = vi.fn();
    render(<ManageLocationsList locations={LOCATIONS} onReorder={onReorder} onRemove={vi.fn()} onClose={vi.fn()} />);

    const handle = dragHandleFor('San Francisco');
    fireEvent.pointerDown(handle, { clientY: rowCenter(1), pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: rowCenter(1), pointerId: 1 });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('renders a Close button that calls onClose when clicked', () => {
    const onClose = vi.fn();
    render(<ManageLocationsList locations={LOCATIONS} onReorder={vi.fn()} onRemove={vi.fn()} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

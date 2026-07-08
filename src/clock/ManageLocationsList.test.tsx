import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManageLocationsList } from './ManageLocationsList';
import type { ManageLocationsListProps } from './ManageLocationsList';
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

function renderList(overrides: Partial<ManageLocationsListProps> = {}) {
  const onReorder = vi.fn();
  const onRemove = vi.fn();
  const onClose = vi.fn();
  const onUpdateLocation = vi.fn();
  const onSetHome = vi.fn();
  render(
    <ManageLocationsList
      locations={LOCATIONS}
      onReorder={onReorder}
      onRemove={onRemove}
      onClose={onClose}
      onUpdateLocation={onUpdateLocation}
      onSetHome={onSetHome}
      {...overrides}
    />,
  );
  return { onReorder, onRemove, onClose, onUpdateLocation, onSetHome };
}

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
    renderList();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByLabelText('Home')).toBeTruthy();
    expect(within(rows[0]).getByText('Tel Aviv')).toBeTruthy();
    expect(within(rows[1]).queryByLabelText('Home')).toBeNull();
    expect(within(rows[1]).getByText('San Francisco')).toBeTruthy();
    expect(within(rows[2]).getByText('New York')).toBeTruthy();
  });

  it('has no remove button on the home row, and a working remove button on other rows', () => {
    const { onRemove } = renderList();

    expect(screen.queryByRole('button', { name: 'Remove Tel Aviv' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove San Francisco' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith('san-francisco');
  });

  it('dragging a ring down past its outward neighbor swaps them, keeping home in place', () => {
    const { onReorder } = renderList();

    // San Francisco (row 1) dragged past New York's (row 2) center
    drag(dragHandleFor('San Francisco'), rowCenter(1), rowCenter(2) + 1);

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(['tel-aviv', 'new-york', 'san-francisco']);
  });

  it('dragging a ring up past home promotes it to home', () => {
    const { onReorder } = renderList();

    // San Francisco (row 1) dragged above Tel Aviv's (row 0) center
    drag(dragHandleFor('San Francisco'), rowCenter(1), 0);

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(['san-francisco', 'tel-aviv', 'new-york']);
  });

  it('does not call onReorder when the drag ends back at the original position', () => {
    const { onReorder } = renderList();

    drag(dragHandleFor('San Francisco'), rowCenter(1), rowCenter(1));

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('does not call onReorder for a plain click with no pointer movement', () => {
    const { onReorder } = renderList();

    const handle = dragHandleFor('San Francisco');
    fireEvent.pointerDown(handle, { clientY: rowCenter(1), pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: rowCenter(1), pointerId: 1 });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('renders a Close button that calls onClose when clicked', () => {
    const { onClose } = renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // mobile's MobileConfigView already has its own persistent "Done" header —
  // hideCloseButton drops this list's own Close so there's only one way to exit
  it('omits the Close button when hideCloseButton is set', () => {
    renderList({ hideCloseButton: true });

    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });
});

// tapping a row (its swatch+label area, not the drag handle or remove button)
// expands it in place to edit color/hours or promote it to home — the only way
// to change these after add-time (and, on mobile, the only way at all: the
// simplified add flow no longer offers color/hours upfront)
describe('ManageLocationsList row expand/edit', () => {
  it('is collapsed by default: no color/hours controls or Set as home button visible', () => {
    renderList();

    expect(screen.queryByLabelText('Hex color for San Francisco')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set as home' })).toBeNull();
  });

  it('expands a row on tap to reveal color, hours, and Set as home (for non-home rows)', async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole('button', { name: 'Edit San Francisco' }));

    expect(screen.getByLabelText('Hex color for San Francisco')).toBeTruthy();
    expect(screen.getByLabelText('Start')).toBeTruthy();
    expect(screen.getByLabelText('End')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Set as home' })).toBeTruthy();
  });

  it('does not show Set as home for the already-home row', async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole('button', { name: 'Edit Tel Aviv' }));

    expect(screen.getByLabelText('Hex color for Tel Aviv')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set as home' })).toBeNull();
  });

  it('collapses again on a second tap', async () => {
    const user = userEvent.setup();
    renderList();
    const toggle = screen.getByRole('button', { name: 'Edit San Francisco' });

    await user.click(toggle);
    expect(screen.getByLabelText('Hex color for San Francisco')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Hide San Francisco' }));
    expect(screen.queryByLabelText('Hex color for San Francisco')).toBeNull();
  });

  it('only one row is expanded at a time', async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole('button', { name: 'Edit San Francisco' }));
    expect(screen.getByLabelText('Hex color for San Francisco')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Edit New York' }));
    expect(screen.queryByLabelText('Hex color for San Francisco')).toBeNull();
    expect(screen.getByLabelText('Hex color for New York')).toBeTruthy();
  });

  it('calls onUpdateLocation with the new color when a swatch is picked', async () => {
    const user = userEvent.setup();
    const { onUpdateLocation } = renderList();

    await user.click(screen.getByRole('button', { name: 'Edit San Francisco' }));
    await user.click(screen.getByRole('button', { name: 'Color #38BDF8' }));

    expect(onUpdateLocation).toHaveBeenCalledWith('san-francisco', { color: '#38BDF8' });
  });

  it('calls onUpdateLocation with the typed hex value', async () => {
    const user = userEvent.setup();
    const { onUpdateLocation } = renderList();

    await user.click(screen.getByRole('button', { name: 'Edit San Francisco' }));
    const hexInput = screen.getByLabelText('Hex color for San Francisco');
    fireEvent.change(hexInput, { target: { value: '#123456' } });

    expect(onUpdateLocation).toHaveBeenCalledWith('san-francisco', { color: '#123456' });
  });

  // regression: typing live (not a single fireEvent.change like above) used to
  // apply every keystroke straight to the ring's actual color — an incomplete
  // hex cut short mid-edit (e.g. by clicking "Set as home" before finishing)
  // would get baked in as the location's real, rendered color
  it('does not call onUpdateLocation for an incomplete hex value while still typing', async () => {
    const user = userEvent.setup();
    const { onUpdateLocation } = renderList();

    await user.click(screen.getByRole('button', { name: 'Edit San Francisco' }));
    const hexInput = screen.getByLabelText('Hex color for San Francisco');
    await user.clear(hexInput);
    await user.type(hexInput, '#3644'); // incomplete — not yet a full 6-digit hex

    expect(onUpdateLocation).not.toHaveBeenCalled();
    expect((hexInput as HTMLInputElement).value).toBe('#3644'); // still reflects what was typed
  });

  it('commits the color the moment typing completes a valid hex, mid-stream', async () => {
    const user = userEvent.setup();
    const { onUpdateLocation } = renderList();

    await user.click(screen.getByRole('button', { name: 'Edit San Francisco' }));
    const hexInput = screen.getByLabelText('Hex color for San Francisco');
    await user.clear(hexInput);
    await user.type(hexInput, '#364449');

    expect(onUpdateLocation).toHaveBeenLastCalledWith('san-francisco', { color: '#364449' });
  });

  it('calls onUpdateLocation with the new Start/End hours', async () => {
    const user = userEvent.setup();
    const { onUpdateLocation } = renderList();

    await user.click(screen.getByRole('button', { name: 'Edit San Francisco' }));
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '19' } });

    expect(onUpdateLocation).toHaveBeenCalledWith('san-francisco', { workStart: 10 });
    expect(onUpdateLocation).toHaveBeenCalledWith('san-francisco', { workEnd: 19 });
  });

  it('calls onSetHome with the full location when Set as home is tapped', async () => {
    const user = userEvent.setup();
    const { onSetHome } = renderList();

    await user.click(screen.getByRole('button', { name: 'Edit San Francisco' }));
    await user.click(screen.getByRole('button', { name: 'Set as home' }));

    expect(onSetHome).toHaveBeenCalledWith(LOCATIONS[1]);
  });
});

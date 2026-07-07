import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManageLocationsList } from './ManageLocationsList';
import type { Location } from './types';

afterEach(cleanup);

const HOME: Location = { id: 'tel-aviv', label: 'Tel Aviv', timezoneId: 'Asia/Jerusalem', color: '#38BDF8', workStart: 9, workEnd: 18 };
const SF: Location = { id: 'san-francisco', label: 'San Francisco', timezoneId: 'America/Los_Angeles', color: '#FB7185', workStart: 9, workEnd: 18 };
const NY: Location = { id: 'new-york', label: 'New York', timezoneId: 'America/New_York', color: '#FBBF4B', workStart: 9, workEnd: 18 };

// inside -> outside: home first, then rings from innermost to outermost
const LOCATIONS = [
  { ...HOME, isHome: true },
  { ...SF, isHome: false },
  { ...NY, isHome: false },
];

describe('ManageLocationsList', () => {
  it('renders one row per location, inside->outside, with a home icon on the first row only', () => {
    render(<ManageLocationsList locations={LOCATIONS} onReorder={vi.fn()} onRemove={vi.fn()} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByLabelText('Home')).toBeTruthy();
    expect(within(rows[0]).getByText('Tel Aviv')).toBeTruthy();
    expect(within(rows[1]).queryByLabelText('Home')).toBeNull();
    expect(within(rows[1]).getByText('San Francisco')).toBeTruthy();
    expect(within(rows[2]).getByText('New York')).toBeTruthy();
  });

  it('has no remove button on the home row, and a working remove button on other rows', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<ManageLocationsList locations={LOCATIONS} onReorder={vi.fn()} onRemove={onRemove} />);

    expect(screen.queryByRole('button', { name: 'Remove Tel Aviv' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Remove San Francisco' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith('san-francisco');
  });

  it('disables moving the first row up and the last row down', () => {
    render(<ManageLocationsList locations={LOCATIONS} onReorder={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Move Tel Aviv up' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Move New York down' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Move San Francisco up' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Move San Francisco down' }).hasAttribute('disabled')).toBe(false);
  });

  it('moving a ring down swaps it with its outward neighbor, keeping home in place', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    render(<ManageLocationsList locations={LOCATIONS} onReorder={onReorder} onRemove={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Move San Francisco down' }));

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(['tel-aviv', 'new-york', 'san-francisco']);
  });

  it('moving a ring up into the home slot promotes it to home', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    render(<ManageLocationsList locations={LOCATIONS} onReorder={onReorder} onRemove={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Move San Francisco up' }));

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(['san-francisco', 'tel-aviv', 'new-york']);
  });

  it('does not call onReorder when clicking a disabled boundary button', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    render(<ManageLocationsList locations={LOCATIONS} onReorder={onReorder} onRemove={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Move Tel Aviv up' }));
    await user.click(screen.getByRole('button', { name: 'Move New York down' }));

    expect(onReorder).not.toHaveBeenCalled();
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddLocationForm } from './AddLocationForm';
import { DEFAULT_WORK_END, DEFAULT_WORK_START, PALETTE } from './defaultCities';

afterEach(cleanup);

async function pickTokyo(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Search city'), 'Tokyo');
  await user.click(await screen.findByRole('button', { name: /Tokyo/ }));
}

describe('AddLocationForm', () => {
  it('searches, selects a city, and adds a location with the default color and work hours', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLocationForm existingIds={['tel-aviv']} onAdd={onAdd} onCancel={vi.fn()} />);

    await pickTokyo(user);
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tokyo',
        label: 'Tokyo',
        timezoneId: 'Asia/Tokyo',
        color: PALETTE[0],
        workStart: DEFAULT_WORK_START,
        workEnd: DEFAULT_WORK_END,
      }),
    );
  });

  it('lets the user pick a color swatch before submitting', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLocationForm existingIds={[]} onAdd={onAdd} onCancel={vi.fn()} />);

    await pickTokyo(user);
    await user.click(screen.getByRole('button', { name: `Color ${PALETTE[2]}` }));
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ color: PALETTE[2] }));
  });

  it('shows an inline validation error and does not call onAdd for an invalid hex color', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLocationForm existingIds={[]} onAdd={onAdd} onCancel={vi.fn()} />);

    await pickTokyo(user);
    const hexInput = screen.getByLabelText('Hex color');
    await user.clear(hexInput);
    await user.type(hexInput, 'notahex');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/color must be a hex value/i);
  });

  it('does not call onAdd when no city has been selected', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLocationForm existingIds={[]} onAdd={onAdd} onCancel={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/pick a city/i);
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<AddLocationForm existingIds={[]} onAdd={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

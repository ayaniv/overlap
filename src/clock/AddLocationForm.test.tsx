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
  it('searches, selects a city, and adds a location with an unused default color and default work hours', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    // every palette swatch but the last is already in use, so the suggested default is deterministic
    render(
      <AddLocationForm
        existingIds={['tel-aviv']}
        existingColors={PALETTE.slice(0, PALETTE.length - 1)}
        onAdd={onAdd}
        onDone={vi.fn()}
      />,
    );

    await pickTokyo(user);
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tokyo',
        label: 'Tokyo',
        timezoneId: 'Asia/Tokyo',
        color: PALETTE[PALETTE.length - 1],
        workStart: DEFAULT_WORK_START,
        workEnd: DEFAULT_WORK_END,
      }),
    );
  });

  it('defaults to some palette color when none are in use yet', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLocationForm existingIds={[]} existingColors={[]} onAdd={onAdd} onDone={vi.fn()} />);

    await pickTokyo(user);
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(PALETTE).toContain(onAdd.mock.calls[0][0].color);
  });

  it('lets the user pick a color swatch before submitting', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLocationForm existingIds={[]} existingColors={[]} onAdd={onAdd} onDone={vi.fn()} />);

    await pickTokyo(user);
    await user.click(screen.getByRole('button', { name: `Color ${PALETTE[2]}` }));
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ color: PALETTE[2] }));
  });

  it('shows an inline validation error and does not call onAdd for an invalid hex color', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLocationForm existingIds={[]} existingColors={[]} onAdd={onAdd} onDone={vi.fn()} />);

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
    render(<AddLocationForm existingIds={[]} existingColors={[]} onAdd={onAdd} onDone={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/pick a city/i);
  });

  it('calls onDone when Done is clicked', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<AddLocationForm existingIds={[]} existingColors={[]} onAdd={vi.fn()} onDone={onDone} />);

    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

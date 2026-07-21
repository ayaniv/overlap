import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RingIncludeCheckbox } from './RingIncludeCheckbox';
import type { Location } from './types';

afterEach(() => {
  cleanup();
});

const LOCATION: Location = { id: 'tokyo', label: 'Tokyo', timezoneId: 'Asia/Tokyo', color: '#38BDF8', workStart: 9, workEnd: 18 };

describe('RingIncludeCheckbox', () => {
  it('renders a checkbox reflecting the checked prop', () => {
    render(<RingIncludeCheckbox location={LOCATION} dotPosition={{ x: 500, y: 340 }} checked={true} onToggle={vi.fn()} />);

    const checkbox = screen.getByTestId('ring-include-checkbox-tokyo') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(checkbox.disabled).toBe(false);
  });

  it('calls onToggle when clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<RingIncludeCheckbox location={LOCATION} dotPosition={{ x: 500, y: 340 }} checked={true} onToggle={onToggle} />);

    await user.click(screen.getByTestId('ring-include-checkbox-tokyo'));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

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
    render(<RingIncludeCheckbox location={LOCATION} dotPosition={{ x: 500, y: 340 }} checked={true} disabled={false} onToggle={vi.fn()} />);

    const checkbox = screen.getByTestId('ring-include-checkbox-tokyo') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(checkbox.disabled).toBe(false);
  });

  it('calls onToggle when clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<RingIncludeCheckbox location={LOCATION} dotPosition={{ x: 500, y: 340 }} checked={true} disabled={false} onToggle={onToggle} />);

    await user.click(screen.getByTestId('ring-include-checkbox-tokyo'));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  // regression: a ring that can never be reconciled with the current
  // selection used to leave its checkbox fully interactive-looking, so
  // clicking it just silently snapped back to unchecked -- indistinguishable
  // from a broken control. disabled + disabledReason communicate why instead.
  it('renders disabled with a title tooltip when disabledReason is set', () => {
    render(
      <RingIncludeCheckbox
        location={LOCATION}
        dotPosition={{ x: 500, y: 340 }}
        checked={false}
        disabled={true}
        disabledReason="Tokyo can't fit a meeting time with the cities currently selected"
        onToggle={vi.fn()}
      />,
    );

    const checkbox = screen.getByTestId('ring-include-checkbox-tokyo') as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
    expect(checkbox.closest('label')?.getAttribute('title')).toBe("Tokyo can't fit a meeting time with the cities currently selected");
  });

  it('does not call onToggle when clicked while disabled', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <RingIncludeCheckbox
        location={LOCATION}
        dotPosition={{ x: 500, y: 340 }}
        checked={false}
        disabled={true}
        disabledReason="can't fit"
        onToggle={onToggle}
      />,
    );

    await user.click(screen.getByTestId('ring-include-checkbox-tokyo'));

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('has no title tooltip when enabled', () => {
    render(<RingIncludeCheckbox location={LOCATION} dotPosition={{ x: 500, y: 340 }} checked={false} disabled={false} onToggle={vi.fn()} />);

    expect(screen.getByTestId('ring-include-checkbox-tokyo').closest('label')?.getAttribute('title')).toBeNull();
  });
});

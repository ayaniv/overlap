// src/clock/ScrubHint.test.tsx
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScrubHint } from './ScrubHint.tsx';

afterEach(() => {
  cleanup();
});

describe('ScrubHint', () => {
  it('renders the hand, the hint text, and a Got it button', () => {
    render(<ScrubHint offsetMs={0} totalRings={2} onDismiss={vi.fn()} />);

    expect(screen.getByText('👆')).toBeTruthy();
    expect(screen.getByText('Find the right time to schedule a meeting')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Got it' })).toBeTruthy();
  });

  it('calls onDismiss when Got it is clicked', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<ScrubHint offsetMs={0} totalRings={2} onDismiss={onDismiss} />);

    await user.click(screen.getByRole('button', { name: 'Got it' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

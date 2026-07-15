// src/clock/ScrubHint.test.tsx
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HINT_TEXT, ScrubHint } from './ScrubHint.tsx';

afterEach(() => {
  cleanup();
});

describe('ScrubHint', () => {
  it('renders the hand, the hint text, and a Got it button', () => {
    render(<ScrubHint offsetMs={0} totalRings={2} onDismiss={vi.fn()} />);

    expect(screen.getByTestId('scrub-hint-hand')).toBeTruthy();
    expect(screen.getByTestId('scrub-hint-text').textContent).toBe(HINT_TEXT);
    expect(screen.getByTestId('scrub-hint-dismiss-button').textContent).toBe('Got it');
  });

  it('calls onDismiss when Got it is clicked', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<ScrubHint offsetMs={0} totalRings={2} onDismiss={onDismiss} />);

    await user.click(screen.getByTestId('scrub-hint-dismiss-button'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

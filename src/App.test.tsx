import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

// useSweepAngle reads window.matchMedia, which jsdom doesn't implement
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function scrubForwardOneHour(user: ReturnType<typeof userEvent.setup>) {
  const slider = screen.getByRole('slider');
  slider.focus();
  await user.keyboard('{ArrowRight}');
}

describe('App — leaving schedule mode resets the scrub preview', () => {
  it('resets the scrub offset after switching to Edit mode and back, not just via the form\'s own Cancel', async () => {
    const user = userEvent.setup();
    render(<App />);

    await scrubForwardOneHour(user);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).not.toBe('0');

    // this path bypasses ScheduleForm's own Cancel entirely — clicking Edit directly
    // used to leave the scrub offset stuck, silently reapplied once back in view mode
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0');
  });

  it('resets the scrub offset when the Schedule icon toggles the panel closed', async () => {
    const user = userEvent.setup();
    render(<App />);

    await scrubForwardOneHour(user);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).not.toBe('0');

    // the ControlCluster's Schedule icon-button, disambiguated from the form's own
    // "Schedule" submit button (same accessible name) via its title attribute
    await user.click(screen.getByTitle('Schedule'));

    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0');
  });
});

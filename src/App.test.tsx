import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

// useSweepAngle (reduced-motion) and useIsPortrait (orientation) both read
// window.matchMedia, which jsdom doesn't implement; `portrait` lets individual
// tests opt into simulating the portrait/mobile layout
function stubMatchMedia(portrait = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(orientation: portrait)' ? portrait : false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  stubMatchMedia();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function scrubForward(user: ReturnType<typeof userEvent.setup>) {
  const slider = screen.getByRole('slider');
  slider.focus();
  await user.keyboard('{ArrowRight}');
}

// ControlCluster starts collapsed behind the hamburger toggle (M7); open it before
// reaching for one of its action buttons
async function openClusterMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Menu' }));
}

describe('App — leaving schedule mode resets the scrub preview', () => {
  it('resets the scrub offset after switching to Config mode and back, not just via the form\'s own Cancel', async () => {
    const user = userEvent.setup();
    render(<App />);

    await scrubForward(user);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).not.toBe('0');

    // this path bypasses ScheduleForm's own Cancel entirely — clicking the config
    // cogwheel directly used to leave the scrub offset stuck, silently reapplied
    // once back in view mode
    await openClusterMenu(user);
    await user.click(screen.getByRole('button', { name: 'Config' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0');
  });

  it('resets the scrub offset when the Schedule icon toggles the panel closed', async () => {
    const user = userEvent.setup();
    render(<App />);

    await scrubForward(user);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).not.toBe('0');

    // the ControlCluster's Schedule icon-button, disambiguated from the form's own
    // "Schedule" submit button (same accessible name) via its title attribute
    await openClusterMenu(user);
    await user.click(screen.getByTitle('Schedule'));

    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0');
  });
});

describe('App — scrubbing auto-opens the schedule panel only outside portrait', () => {
  it('auto-opens the schedule panel on the first scrub in landscape/desktop', async () => {
    const user = userEvent.setup();
    render(<App />);

    await scrubForward(user);

    expect(screen.getByText('Schedule meeting')).toBeTruthy();
  });

  it('does not auto-open the schedule panel on scrub in portrait', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    render(<App />);

    await scrubForward(user);

    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).not.toBe('0');
    expect(screen.queryByText('Schedule meeting')).toBeNull();
  });

  it('a portrait scrub still counts toward hasScrubbed, so explicitly opening Schedule afterward is not gated', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    render(<App />);

    await scrubForward(user);
    await openClusterMenu(user);
    await user.click(screen.getByTitle('Schedule'));

    const titleInput = screen.getByLabelText('Meeting title') as HTMLInputElement;
    expect(titleInput.closest('fieldset')?.disabled).toBe(false);
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsProvider } from '../analytics/AnalyticsProvider';
import { createMockAnalyticsService } from '../analytics/mockAnalyticsService';
import { AddLocationForm } from './AddLocationForm';
import type { AddLocationFormProps } from './AddLocationForm';
import { DEFAULT_WORK_END, DEFAULT_WORK_START, PALETTE } from './defaultCities';

afterEach(cleanup);

async function pickTokyo(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Search city'), 'Tokyo');
  await user.click(await screen.findByTestId('city-suggestion-Asia/Tokyo-Tokyo'));
}

function renderForm(overrides: Partial<AddLocationFormProps> = {}) {
  const onAdd = vi.fn();
  const onDone = vi.fn();
  const analytics = createMockAnalyticsService();
  render(
    <AnalyticsProvider service={analytics}>
      <AddLocationForm existingIds={[]} existingColors={[]} onAdd={onAdd} onDone={onDone} {...overrides} />
    </AnalyticsProvider>,
  );
  return { onAdd, onDone, analytics };
}

describe('AddLocationForm', () => {
  it('searches, selects a city, and adds a location with an unused default color and default work hours', async () => {
    const user = userEvent.setup();
    // every palette swatch but the last is already in use, so the suggested default is deterministic
    const { onAdd, analytics } = renderForm({ existingIds: ['tel-aviv'], existingColors: PALETTE.slice(0, PALETTE.length - 1) });

    await pickTokyo(user);
    await user.click(screen.getByTestId('add-location-submit'));

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
    expect(analytics.trackEvent).toHaveBeenCalledWith('location_added', {
      timezone_id: 'Asia/Tokyo',
      country: 'Japan',
    });
  });

  it('defaults to some palette color when none are in use yet', async () => {
    const user = userEvent.setup();
    const { onAdd } = renderForm();

    await pickTokyo(user);
    await user.click(screen.getByTestId('add-location-submit'));

    expect(PALETTE).toContain(onAdd.mock.calls[0][0].color);
  });

  it('lets the user pick a color swatch before submitting', async () => {
    const user = userEvent.setup();
    const { onAdd } = renderForm();

    await pickTokyo(user);
    await user.click(screen.getByTestId(`color-swatch-${PALETTE[2]}`));
    await user.click(screen.getByTestId('add-location-submit'));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ color: PALETTE[2] }));
  });

  it('shows an inline validation error and does not call onAdd for an invalid hex color', async () => {
    const user = userEvent.setup();
    const { onAdd } = renderForm();

    await pickTokyo(user);
    const hexInput = screen.getByLabelText('Hex color');
    await user.clear(hexInput);
    await user.type(hexInput, 'notahex');
    await user.click(screen.getByTestId('add-location-submit'));

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/color must be a hex value/i);
  });

  // regression: LocationColorAndHoursFields' Start/End inputs used to clamp
  // every keystroke live (a behavior meant for ManageLocationsList's row
  // editor), which silently overrode this form's original free-type-then-
  // validate-at-submit design — typing should reach the input raw, unclamped
  it('lets Start/End be typed out of range without clamping, unlike ManageLocationsList', async () => {
    const user = userEvent.setup();
    renderForm();

    await pickTokyo(user);
    const startInput = screen.getByLabelText('Start');
    await user.clear(startInput);
    await user.type(startInput, '30');

    expect((startInput as HTMLInputElement).value).toBe('30');
  });

  it('shows an inline validation error and does not call onAdd when Start is not before End', async () => {
    const user = userEvent.setup();
    const { onAdd } = renderForm();

    await pickTokyo(user);
    const startInput = screen.getByLabelText('Start');
    await user.clear(startInput);
    await user.type(startInput, String(DEFAULT_WORK_END));
    await user.click(screen.getByTestId('add-location-submit'));

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/start hour must be before end hour/i);
  });

  it('does not call onAdd when no city has been selected', async () => {
    const user = userEvent.setup();
    const { onAdd } = renderForm();

    await user.click(screen.getByTestId('add-location-submit'));

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/pick a city/i);
  });

  it('shows Cancel and calls onDone before anything has been added', async () => {
    const user = userEvent.setup();
    const { onDone } = renderForm();

    expect(screen.getByTestId('add-location-dismiss').textContent).toBe('Cancel');
    await user.click(screen.getByTestId('add-location-dismiss'));

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('switches to Done (still calling onDone) once a location has been added', async () => {
    const user = userEvent.setup();
    const { onDone } = renderForm();

    await pickTokyo(user);
    await user.click(screen.getByTestId('add-location-submit'));

    expect(screen.getByTestId('add-location-dismiss').textContent).toBe('Done');
    await user.click(screen.getByTestId('add-location-dismiss'));

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

// mobile: picking a suggestion adds it right away with default color/hours,
// skipping the customize-then-confirm step (redundant taps on a screen this
// size, per feedback) — desktop's flow above is unaffected
describe('AddLocationForm isPortrait (mobile immediate add)', () => {
  it('adds the location immediately on picking a suggestion, with default color and hours, no Add tap needed', async () => {
    const user = userEvent.setup();
    const { onAdd } = renderForm({ isPortrait: true });

    await pickTokyo(user);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Tokyo', timezoneId: 'Asia/Tokyo', workStart: DEFAULT_WORK_START, workEnd: DEFAULT_WORK_END }),
    );
    expect(PALETTE).toContain(onAdd.mock.calls[0][0].color);
  });

  it('does not render color swatches, hex input, hours, or the Cancel/Add/Done row', async () => {
    const user = userEvent.setup();
    renderForm({ isPortrait: true });

    expect(screen.queryByLabelText('Hex color')).toBeNull();
    expect(screen.queryByTestId(`color-swatch-${PALETTE[0]}`)).toBeNull();
    expect(screen.queryByTestId('add-location-submit')).toBeNull();
    expect(screen.queryByTestId('add-location-dismiss')).toBeNull();

    await pickTokyo(user);
    expect(screen.queryByTestId('add-location-dismiss')).toBeNull();
  });

  it('clears the search box after adding, ready for the next pick', async () => {
    const user = userEvent.setup();
    renderForm({ isPortrait: true });

    await pickTokyo(user);

    expect((screen.getByLabelText('Search city') as HTMLInputElement).value).toBe('');
  });

  it('supports adding a second location right after the first, with no manual reset step', async () => {
    const user = userEvent.setup();
    const { onAdd } = renderForm({ existingIds: ['tokyo'], isPortrait: true });

    await user.type(screen.getByLabelText('Search city'), 'London');
    await user.click(await screen.findByTestId('city-suggestion-Europe/London-London'));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0].label).toBe('London');
  });
});

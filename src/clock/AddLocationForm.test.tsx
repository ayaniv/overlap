import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsProvider } from '../analytics/AnalyticsProvider';
import { createMockAnalyticsService } from '../analytics/mockAnalyticsService';
import { LoggerProvider } from '../logger/LoggerProvider';
import { createMockLoggerService } from '../logger/mockLoggerService';
import { AddLocationForm } from './AddLocationForm';
import type { AddLocationFormProps } from './AddLocationForm';
import * as cityCatalog from './cityCatalog';
import { DEFAULT_WORK_END, DEFAULT_WORK_START, PALETTE } from './defaultCities';

// wrapped (not replaced) so the real dataset still loads, but the test can see
// whether and when the form asked for it, and make it fail
vi.mock('./cityCatalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./cityCatalog')>();
  return { ...actual, loadCityCatalog: vi.fn(actual.loadCityCatalog) };
});

beforeEach(() => {
  vi.mocked(cityCatalog.loadCityCatalog).mockClear();
});

afterEach(cleanup);

async function pickTokyo(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Search city'), 'Tokyo');
  await user.click(await screen.findByTestId('city-suggestion-Asia/Tokyo-Tokyo'));
}

function renderForm(overrides: Partial<AddLocationFormProps> = {}) {
  const onAdd = vi.fn();
  const onDone = vi.fn();
  const analytics = createMockAnalyticsService();
  const logger = createMockLoggerService();
  render(
    <AnalyticsProvider service={analytics}>
      <LoggerProvider service={logger}>
        <AddLocationForm existingIds={[]} existingColors={[]} onAdd={onAdd} onDone={onDone} {...overrides} />
      </LoggerProvider>
    </AnalyticsProvider>,
  );
  return { onAdd, onDone, analytics, logger };
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

describe('AddLocationForm city list', () => {
  it('can pick Boston, which the old per-timezone list did not include', async () => {
    const user = userEvent.setup();
    const { onAdd } = renderForm();

    await user.type(screen.getByLabelText('Search city'), 'Boston');
    await user.click(await screen.findByTestId('city-suggestion-America/New_York-Boston'));
    await user.click(screen.getByTestId('add-location-submit'));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ label: 'Boston', timezoneId: 'America/New_York' }));
  });

  it('lists Washington, D.C. first for "washington"', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Search city'), 'washington');
    const firstSuggestion = (await screen.findAllByTestId(/^city-suggestion-(?!region)/))[0];

    expect(firstSuggestion.getAttribute('data-testid')).toBe('city-suggestion-America/New_York-Washington, D.C.');
  });

  it('shows the region on each suggestion and no country text', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Search city'), 'Boston');

    expect((await screen.findByTestId('city-suggestion-region-America/New_York-Boston')).textContent).toBe('Massachusetts');
    expect(screen.queryByText(/United States/)).toBeNull();
  });

  it('does not load the city list until the field is focused', async () => {
    const user = userEvent.setup();
    renderForm();
    expect(cityCatalog.loadCityCatalog).not.toHaveBeenCalled();

    await user.click(screen.getByLabelText('Search city'));

    expect(cityCatalog.loadCityCatalog).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state while the list loads, then the suggestions', async () => {
    const user = userEvent.setup();
    let resolveLoad: (cities: cityCatalog.CityEntry[]) => void = () => {};
    vi.mocked(cityCatalog.loadCityCatalog).mockReturnValueOnce(new Promise((resolve) => (resolveLoad = resolve)));
    renderForm();

    await user.type(screen.getByLabelText('Search city'), 'osl');
    expect(screen.getByTestId('city-list-loading')).toBeTruthy();

    resolveLoad([{ label: 'Oslo', timezoneId: 'Europe/Oslo', country: 'Norway', region: 'Oslo', population: 1 }]);

    expect(await screen.findByTestId('city-suggestion-Europe/Oslo-Oslo')).toBeTruthy();
    expect(screen.queryByTestId('city-list-loading')).toBeNull();
  });

  it('logs a failed load, tells the user, and keeps the form usable with the default cities', async () => {
    const user = userEvent.setup();
    const loadError = new Error('chunk failed to load');
    vi.mocked(cityCatalog.loadCityCatalog).mockRejectedValueOnce(loadError);
    const { logger, onAdd } = renderForm();

    await user.type(screen.getByLabelText('Search city'), 'London');

    expect(await screen.findByTestId('city-list-error')).toBeTruthy();
    expect(logger.error).toHaveBeenCalledWith(loadError, 'failed to load the city list for the Add location search');

    await user.click(await screen.findByTestId('city-suggestion-Europe/London-London'));
    await user.click(screen.getByTestId('add-location-submit'));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ label: 'London', timezoneId: 'Europe/London' }));
  });
});

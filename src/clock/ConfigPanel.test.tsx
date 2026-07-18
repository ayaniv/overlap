import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigPanel } from './ConfigPanel';

afterEach(cleanup);

function renderPanel() {
  return render(
    <ConfigPanel
      addLocationContent={<div>Add location form contents</div>}
      manageLocationsContent={<div>Manage locations list contents</div>}
    />,
  );
}

describe('ConfigPanel', () => {
  it('defaults to the Add location section expanded, Manage locations collapsed', () => {
    renderPanel();

    expect(screen.getByTestId('add-location-section-body')).toBeTruthy();
    expect(screen.queryByTestId('manage-locations-section-body')).toBeNull();
    expect(screen.getByTestId('add-location-section-toggle').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('manage-locations-section-toggle').getAttribute('aria-expanded')).toBe('false');
  });

  it('switches to Manage locations when its header is clicked, collapsing Add location', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByTestId('manage-locations-section-toggle'));

    expect(screen.getByTestId('manage-locations-section-body')).toBeTruthy();
    expect(screen.queryByTestId('add-location-section-body')).toBeNull();
    expect(screen.getByTestId('manage-locations-section-toggle').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('add-location-section-toggle').getAttribute('aria-expanded')).toBe('false');
  });

  it('switches back to Add location when its header is clicked again', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByTestId('manage-locations-section-toggle'));
    await user.click(screen.getByTestId('add-location-section-toggle'));

    expect(screen.getByTestId('add-location-section-body')).toBeTruthy();
    expect(screen.queryByTestId('manage-locations-section-body')).toBeNull();
  });

  it('does nothing when clicking the header of the already-active section', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByTestId('add-location-section-toggle'));

    expect(screen.getByTestId('add-location-section-body')).toBeTruthy();
    expect(screen.getByTestId('add-location-section-toggle').getAttribute('aria-expanded')).toBe('true');
  });
});

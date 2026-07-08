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

    expect(screen.getByText('Add location form contents')).toBeTruthy();
    expect(screen.queryByText('Manage locations list contents')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add location' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Manage locations' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('switches to Manage locations when its header is clicked, collapsing Add location', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Manage locations' }));

    expect(screen.getByText('Manage locations list contents')).toBeTruthy();
    expect(screen.queryByText('Add location form contents')).toBeNull();
    expect(screen.getByRole('button', { name: 'Manage locations' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Add location' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('switches back to Add location when its header is clicked again', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Manage locations' }));
    await user.click(screen.getByRole('button', { name: 'Add location' }));

    expect(screen.getByText('Add location form contents')).toBeTruthy();
    expect(screen.queryByText('Manage locations list contents')).toBeNull();
  });

  it('does nothing when clicking the header of the already-active section', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Add location' }));

    expect(screen.getByText('Add location form contents')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add location' }).getAttribute('aria-expanded')).toBe('true');
  });
});

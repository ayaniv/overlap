import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MobileConfigView } from './MobileConfigView';

afterEach(cleanup);

function renderView(onClose = vi.fn()) {
  render(
    <MobileConfigView
      addLocationContent={<div>Add location form contents</div>}
      manageLocationsContent={<div>Manage locations list contents</div>}
      onClose={onClose}
    />,
  );
  return { onClose };
}

describe('MobileConfigView', () => {
  it('shows both sections at once — no accordion, unlike the desktop ConfigPanel', () => {
    renderView();

    expect(screen.getByText('Add location form contents')).toBeTruthy();
    expect(screen.getByText('Manage locations list contents')).toBeTruthy();
    expect(screen.getByText('Add location')).toBeTruthy();
    expect(screen.getByText('Manage locations')).toBeTruthy();
  });

  it('calls onClose when Done is tapped', async () => {
    const user = userEvent.setup();
    const { onClose } = renderView();

    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

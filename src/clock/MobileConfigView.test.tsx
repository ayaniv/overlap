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

    expect(screen.getByTestId('mobile-add-location-body')).toBeTruthy();
    expect(screen.getByTestId('mobile-manage-locations-body')).toBeTruthy();
    expect(screen.getByTestId('mobile-add-location-heading')).toBeTruthy();
    expect(screen.getByTestId('mobile-manage-locations-heading')).toBeTruthy();
  });

  it('calls onClose when Done is tapped', async () => {
    const user = userEvent.setup();
    const { onClose } = renderView();

    await user.click(screen.getByTestId('mobile-config-done'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

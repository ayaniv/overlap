import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ControlCluster } from './ControlCluster';

afterEach(() => {
  cleanup();
});

function renderCluster(mode: Parameters<typeof ControlCluster>[0]['mode'] = 'view') {
  const onSetMode = vi.fn();
  const onShare = vi.fn();
  render(<ControlCluster mode={mode} onSetMode={onSetMode} onShare={onShare} />);
  return { onSetMode, onShare };
}

describe('ControlCluster collapse/expand', () => {
  it('starts collapsed: toggle reports aria-expanded=false and the action buttons are out of the tab order', () => {
    renderCluster();

    const toggle = screen.getByRole('button', { name: 'Menu' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: 'Config' }).getAttribute('tabIndex')).toBe('-1');
    expect(screen.getByRole('button', { name: 'Schedule' }).getAttribute('tabIndex')).toBe('-1');
    expect(screen.getByRole('button', { name: 'Share' }).getAttribute('tabIndex')).toBe('-1');
  });

  it('clicking the toggle expands the cluster and restores the action buttons to the tab order', async () => {
    const user = userEvent.setup();
    renderCluster();

    await user.click(screen.getByRole('button', { name: 'Menu' }));

    const toggle = screen.getByRole('button', { name: 'Menu' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Config' }).getAttribute('tabIndex')).toBe('0');
    expect(screen.getByRole('button', { name: 'Schedule' }).getAttribute('tabIndex')).toBe('0');
    expect(screen.getByRole('button', { name: 'Share' }).getAttribute('tabIndex')).toBe('0');
  });

  it('clicking the toggle a second time collapses it back', async () => {
    const user = userEvent.setup();
    renderCluster();
    const toggle = screen.getByRole('button', { name: 'Menu' });

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: 'Config' }).getAttribute('tabIndex')).toBe('-1');
  });

  it('Config/Schedule/Share still invoke their callbacks once expanded', async () => {
    const user = userEvent.setup();
    const { onSetMode, onShare } = renderCluster();

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(screen.getByRole('button', { name: 'Config' }));
    expect(onSetMode).toHaveBeenCalledWith('edit');

    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(onSetMode).toHaveBeenCalledWith('schedule');

    await user.click(screen.getByRole('button', { name: 'Share' }));
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it('toggling Config off again (already active) returns to view mode', async () => {
    const user = userEvent.setup();
    const { onSetMode } = renderCluster('edit');

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(screen.getByRole('button', { name: 'Config' }));

    expect(onSetMode).toHaveBeenCalledWith('view');
  });

  it('closing the cluster (X) dismisses whichever panel is open, not just the button row', async () => {
    const user = userEvent.setup();
    const { onSetMode } = renderCluster('schedule');
    const toggle = screen.getByRole('button', { name: 'Menu' });

    await user.click(toggle); // expand
    await user.click(toggle); // collapse — should also close the schedule panel

    expect(onSetMode).toHaveBeenCalledWith('view');
  });

  it('opening the cluster does not itself change the mode', async () => {
    const user = userEvent.setup();
    const { onSetMode } = renderCluster('schedule');

    await user.click(screen.getByRole('button', { name: 'Menu' }));

    expect(onSetMode).not.toHaveBeenCalled();
  });
});

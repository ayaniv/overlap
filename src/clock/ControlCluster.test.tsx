import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ControlCluster } from './ControlCluster';
import type { Mode } from './types';

afterEach(() => {
  cleanup();
});

// isExpanded is a controlled prop (App.tsx forces it open on scrub) — this
// harness owns the state locally, like a real caller would, so click-driven
// tests keep working while still exercising the controlled-prop contract
function renderCluster({ mode = 'view' as Mode, initialExpanded = false } = {}) {
  const onSetMode = vi.fn();
  const onShare = vi.fn();
  const onExpandedChange = vi.fn();

  function Harness() {
    const [isExpanded, setIsExpanded] = useState(initialExpanded);
    return (
      <ControlCluster
        mode={mode}
        onSetMode={onSetMode}
        onShare={onShare}
        isExpanded={isExpanded}
        onExpandedChange={(next) => {
          onExpandedChange(next);
          setIsExpanded(next);
        }}
      />
    );
  }

  render(<Harness />);
  return { onSetMode, onShare, onExpandedChange };
}

describe('ControlCluster collapse/expand', () => {
  it('starts collapsed: toggle reports aria-expanded=false and the action buttons are out of the tab order', () => {
    renderCluster();

    const toggle = screen.getByTestId('control-menu-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByTestId('control-config-button').getAttribute('tabIndex')).toBe('-1');
    expect(screen.getByTestId('control-share-button').getAttribute('tabIndex')).toBe('-1');
  });

  it('clicking the toggle expands the cluster and restores the action buttons to the tab order', async () => {
    const user = userEvent.setup();
    renderCluster();

    await user.click(screen.getByTestId('control-menu-toggle'));

    const toggle = screen.getByTestId('control-menu-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('control-config-button').getAttribute('tabIndex')).toBe('0');
    expect(screen.getByTestId('control-share-button').getAttribute('tabIndex')).toBe('0');
  });

  it('clicking the toggle a second time collapses it back', async () => {
    const user = userEvent.setup();
    renderCluster();
    const toggle = screen.getByTestId('control-menu-toggle');

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByTestId('control-config-button').getAttribute('tabIndex')).toBe('-1');
  });

  it('Config/Share still invoke their callbacks once expanded', async () => {
    const user = userEvent.setup();
    const { onSetMode, onShare } = renderCluster();

    await user.click(screen.getByTestId('control-menu-toggle'));
    await user.click(screen.getByTestId('control-config-button'));
    expect(onSetMode).toHaveBeenCalledWith('edit');

    await user.click(screen.getByTestId('control-share-button'));
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it('has no Schedule icon — scheduling only happens via the scrubActions swap', () => {
    renderCluster();
    expect(screen.queryByTestId('control-scrub-schedule-button')).toBeNull();
  });

  it('toggling Config off again (already active) returns to view mode', async () => {
    const user = userEvent.setup();
    const { onSetMode } = renderCluster({ mode: 'edit' });

    await user.click(screen.getByTestId('control-menu-toggle'));
    await user.click(screen.getByTestId('control-config-button'));

    expect(onSetMode).toHaveBeenCalledWith('view');
  });

  it('closing the cluster (X) dismisses whichever panel is open, not just the button row', async () => {
    const user = userEvent.setup();
    const { onSetMode } = renderCluster({ mode: 'edit' });
    const toggle = screen.getByTestId('control-menu-toggle');

    await user.click(toggle); // expand
    await user.click(toggle); // collapse — should also close the Config panel

    expect(onSetMode).toHaveBeenCalledWith('view');
  });

  it('opening the cluster does not itself change the mode', async () => {
    const user = userEvent.setup();
    const { onSetMode } = renderCluster({ mode: 'edit' });

    await user.click(screen.getByTestId('control-menu-toggle'));

    expect(onSetMode).not.toHaveBeenCalled();
  });
});

describe('ControlCluster isExpanded (controlled prop)', () => {
  it('renders expanded when the caller passes isExpanded=true, without any click', () => {
    renderCluster({ initialExpanded: true });

    expect(screen.getByTestId('control-menu-toggle').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('control-config-button').getAttribute('tabIndex')).toBe('0');
  });

  it('reports the intended next value via onExpandedChange on every toggle click', async () => {
    const user = userEvent.setup();
    const { onExpandedChange } = renderCluster();
    const toggle = screen.getByTestId('control-menu-toggle');

    await user.click(toggle);
    expect(onExpandedChange).toHaveBeenLastCalledWith(true);

    await user.click(toggle);
    expect(onExpandedChange).toHaveBeenLastCalledWith(false);
  });
});

// quick-schedule (App.tsx passes this while scrubbing, via WorldClock's
// isScrubActionBarVisible, on any platform): entirely replaces the Config/
// Share icon menu + hamburger toggle with Cancel/Schedule — or, if the preview
// lands on an existing meeting, with Remove Meeting instead of either of them
describe('ControlCluster scrubActions', () => {
  function renderClusterWithScrubActions(
    overrides: Partial<{ isScheduling: boolean; matchedMeeting: { onRemove: () => void; isRemoving: boolean } }> = {},
    isScrubHintActive = false,
  ) {
    const onSchedule = vi.fn();
    const onCancel = vi.fn();
    render(
      <ControlCluster
        mode="view"
        onSetMode={vi.fn()}
        onShare={vi.fn()}
        isExpanded={false}
        onExpandedChange={vi.fn()}
        scrubActions={{ onSchedule, onCancel, isScheduling: false, ...overrides }}
        isScrubHintActive={isScrubHintActive}
      />,
    );
    return { onSchedule, onCancel };
  }

  it('replaces the icon menu with Cancel/Schedule, hiding Config/Share/Menu entirely', () => {
    renderClusterWithScrubActions();

    expect(screen.getByTestId('control-scrub-cancel-button').textContent).toBe('Cancel');
    expect(screen.getByTestId('control-scrub-schedule-button').textContent).toBe('Schedule');
    expect(screen.queryByTestId('control-config-button')).toBeNull();
    expect(screen.queryByTestId('control-share-button')).toBeNull();
    expect(screen.queryByTestId('control-menu-toggle')).toBeNull();
  });

  it('calls onSchedule when Schedule is tapped', async () => {
    const user = userEvent.setup();
    const { onSchedule } = renderClusterWithScrubActions();

    await user.click(screen.getByTestId('control-scrub-schedule-button'));

    expect(onSchedule).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Cancel is tapped', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderClusterWithScrubActions();

    await user.click(screen.getByTestId('control-scrub-cancel-button'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows "Scheduling…" and disables both buttons while isScheduling is true', () => {
    renderClusterWithScrubActions({ isScheduling: true });

    const scheduleButton = screen.getByTestId('control-scrub-schedule-button') as HTMLButtonElement;
    expect(scheduleButton.textContent).toBe('Scheduling…');
    expect(scheduleButton.disabled).toBe(true);
    expect((screen.getByTestId('control-scrub-cancel-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not call onSchedule when disabled by isScheduling', async () => {
    const user = userEvent.setup();
    const { onSchedule } = renderClusterWithScrubActions({ isScheduling: true });

    await user.click(screen.getByTestId('control-scrub-schedule-button'));

    expect(onSchedule).not.toHaveBeenCalled();
  });

  it('marks the cluster data-scrub-hint-active only when the scrub-hint demo (not a real scrub) is active', () => {
    renderClusterWithScrubActions({}, true);

    expect(screen.getByTestId('control-scrub-cancel-button').parentElement?.hasAttribute('data-scrub-hint-active')).toBe(true);
  });

  it('does not mark data-scrub-hint-active for a real user-driven scrub', () => {
    renderClusterWithScrubActions({}, false);

    expect(screen.getByTestId('control-scrub-cancel-button').parentElement?.hasAttribute('data-scrub-hint-active')).toBe(false);
  });

  it('has no Remove Meeting button when matchedMeeting is not set', () => {
    renderClusterWithScrubActions();
    expect(screen.queryByTestId('control-remove-meeting-button')).toBeNull();
  });

  it('replaces Cancel/Schedule with Remove Meeting when matchedMeeting is set', () => {
    renderClusterWithScrubActions({ matchedMeeting: { onRemove: vi.fn(), isRemoving: false } });

    expect(screen.queryByTestId('control-scrub-cancel-button')).toBeNull();
    expect(screen.queryByTestId('control-scrub-schedule-button')).toBeNull();
    expect(screen.getByTestId('control-remove-meeting-button')).toBeTruthy();
  });

  it('calls matchedMeeting.onRemove when Remove Meeting is tapped', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    renderClusterWithScrubActions({ matchedMeeting: { onRemove, isRemoving: false } });

    await user.click(screen.getByTestId('control-remove-meeting-button'));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('relabels to "Removing…" and disables the button while matchedMeeting.isRemoving is true', () => {
    renderClusterWithScrubActions({ matchedMeeting: { onRemove: vi.fn(), isRemoving: true } });

    const removeButton = screen.getByTestId('control-remove-meeting-button') as HTMLButtonElement;
    expect(removeButton.textContent).toContain('Removing…');
    expect(removeButton.disabled).toBe(true);
  });
});


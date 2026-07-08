import { useCallback, useMemo, useRef, useState } from 'react';
import { AddLocationForm } from './clock/AddLocationForm';
import { isGoogleCalendarConnected } from './clock/googleCalendar';
import { ScheduleForm } from './clock/ScheduleForm';
import { shareLink } from './clock/share';
import type { ShareOutcome } from './clock/share';
import { useRingScrub } from './clock/useRingScrub';
import { WorldClock } from './clock/WorldClock';
import type { Mode } from './clock/types';
import type { RingScrubBind } from './clock/useRingScrub';
import { useClockConfig } from './hooks/useClockConfig';
import { useNow } from './hooks/useNow';
import { useToast } from './hooks/useToast';

const SHARE_TOAST_MESSAGE: Partial<Record<ShareOutcome, string>> = {
  copied: 'Link copied',
  failed: "Couldn't copy link",
};

const MARK_SCRUBBED_DEBOUNCE_MS = 300;

function App() {
  const now = useNow();
  const { config, addLocation, removeLocation, addMeeting } = useClockConfig();
  const [mode, setMode] = useState<Mode>('view');
  const { message: toastMessage, showToast } = useToast();
  const { previewOffsetMs: scrubOffsetMs, isDragging: isScrubbing, reset: resetScrub, setOffsetMs, bind: scrubBind } = useRingScrub();
  // gates the schedule form: the user must scrub the rings (drag or arrow keys) at
  // least once before they can submit — forces a deliberate time pick via the app's
  // core gesture instead of silently defaulting to "now". Scrubbing itself works
  // whenever the clock isn't in edit mode, independent of the schedule form's state,
  // so previewing a time doesn't require opening — or keeping open — the panel first
  const [hasScrubbed, setHasScrubbed] = useState(false);
  const canScrub = mode !== 'edit';

  const handleShare = useCallback(() => {
    void shareLink(navigator, navigator.clipboard, window.location.href).then((outcome) => {
      // "shared" (native share sheet shown) and "cancelled" (user dismissed it)
      // get no toast — the OS UI already gave feedback, or there's nothing to report
      const message = SHARE_TOAST_MESSAGE[outcome];
      if (message) showToast(message);
    });
  }, [showToast]);

  const exitEditMode = useCallback(() => setMode('view'), []);

  // returning to view resets the preview back to "now" — a deliberate way to abandon
  // an in-progress scheduling attempt, distinct from just toggling the panel closed
  const exitScheduleMode = useCallback(() => {
    setMode('view');
    resetScrub();
    setHasScrubbed(false);
  }, [resetScrub]);

  const previewInstant = useMemo(() => new Date(now.getTime() + scrubOffsetMs), [now, scrubOffsetMs]);

  const handleChangeInstant = useCallback(
    (instant: Date) => setOffsetMs(instant.getTime() - now.getTime()),
    [setOffsetMs, now],
  );

  // scrubbing is the entry point into scheduling: starting a drag (or pressing an
  // arrow key) from view mode opens the schedule panel automatically, so the user
  // sees the form fill in live as they pick a time instead of having to scrub first
  // and only then think to click Schedule. onPointerDown fires once per drag, but
  // onKeyDown repeats continuously while an arrow key is held — debounced (leading
  // edge) so holding a key doesn't call setState on every repeat, only once per burst
  const lastMarkScrubbedRef = useRef(0);
  const markScrubbed = useCallback(() => {
    const timestamp = Date.now();
    if (timestamp - lastMarkScrubbedRef.current < MARK_SCRUBBED_DEBOUNCE_MS) return;
    lastMarkScrubbedRef.current = timestamp;
    setHasScrubbed(true);
    setMode((current) => (current === 'view' ? 'schedule' : current));
  }, []);

  const scrubBindWithGate: RingScrubBind = useMemo(
    () => ({
      ...scrubBind,
      onPointerDown: (event) => {
        markScrubbed();
        scrubBind.onPointerDown(event);
      },
      onKeyDown: (event) => {
        markScrubbed();
        scrubBind.onKeyDown(event);
      },
    }),
    [scrubBind, markScrubbed],
  );

  const modePanelContent =
    mode === 'edit' ? (
      <AddLocationForm
        existingIds={[config.home.id, ...config.rings.map((location) => location.id)]}
        existingColors={[config.home.color, ...config.rings.map((location) => location.color)]}
        onAdd={addLocation}
        onDone={exitEditMode}
      />
    ) : mode === 'schedule' ? (
      <ScheduleForm
        previewInstant={previewInstant}
        onChangeInstant={handleChangeInstant}
        existingMeetingIds={config.meetings.map((meeting) => meeting.id)}
        onScheduled={addMeeting}
        onCancel={exitScheduleMode}
        isEnabled={hasScrubbed}
      />
    ) : undefined;

  return (
    <WorldClock
      now={now}
      home={config.home}
      rings={config.rings}
      meetings={config.meetings}
      mode={mode}
      onSetMode={setMode}
      onShare={handleShare}
      onRemoveLocation={removeLocation}
      modePanelContent={modePanelContent}
      toastMessage={toastMessage}
      previewOffsetMs={canScrub ? scrubOffsetMs : 0}
      scrubBind={canScrub ? scrubBindWithGate : undefined}
      isScrubbing={isScrubbing}
      isGoogleCalendarConnected={isGoogleCalendarConnected()}
    />
  );
}

export default App;

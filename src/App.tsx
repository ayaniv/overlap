import { useCallback, useMemo, useRef, useState } from 'react';
import { AddLocationForm } from './clock/AddLocationForm';
import { isGoogleCalendarConnected } from './clock/googleCalendar';
import { ScheduleForm } from './clock/ScheduleForm';
import { shareLink } from './clock/share';
import type { ShareOutcome } from './clock/share';
import { useRingScrub } from './clock/useRingScrub';
import { WorldClock } from './clock/WorldClock';
import type { Meeting, Mode } from './clock/types';
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
  // isGoogleCalendarConnected() reads localStorage; read it once on mount rather
  // than on every render (App re-renders every second via useNow's tick) — it only
  // ever changes at the one moment a schedule attempt succeeds, so handleScheduled
  // below re-reads it right there instead of polling it on a timer
  const [isConnectedToGoogleCalendar, setIsConnectedToGoogleCalendar] = useState(() => isGoogleCalendarConnected());

  const handleShare = useCallback(() => {
    void shareLink(navigator, navigator.clipboard, window.location.href).then((outcome) => {
      // "shared" (native share sheet shown) and "cancelled" (user dismissed it)
      // get no toast — the OS UI already gave feedback, or there's nothing to report
      const message = SHARE_TOAST_MESSAGE[outcome];
      if (message) showToast(message);
    });
  }, [showToast]);

  const handleScheduled = useCallback(
    (meeting: Meeting) => {
      addMeeting(meeting);
      // scheduling only succeeds after a successful Google sign-in (see
      // scheduleMeetingOnGoogleCalendar) — that's exactly the moment the connected
      // flag flips, so re-read it here instead of on every render
      setIsConnectedToGoogleCalendar(isGoogleCalendarConnected());
    },
    [addMeeting],
  );

  // the single place mode ever changes: leaving schedule mode — however it happens
  // (the form's Cancel, the calendar-icon toggle closing the panel, switching to
  // Edit, the post-success auto-return) — always abandons the in-progress scrub
  // preview. Previously only the form's own Cancel button did this reset, so e.g.
  // clicking Edit directly left scrubOffsetMs stuck at its last value, silently
  // reapplied once the user returned to view mode.
  const changeMode = useCallback(
    (nextMode: Mode) => {
      if (mode === 'schedule' && nextMode !== 'schedule') {
        resetScrub();
        setHasScrubbed(false);
      }
      setMode(nextMode);
    },
    [mode, resetScrub],
  );

  const exitToView = useCallback(() => changeMode('view'), [changeMode]);

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
        onDone={exitToView}
      />
    ) : mode === 'schedule' ? (
      <ScheduleForm
        previewInstant={previewInstant}
        onChangeInstant={handleChangeInstant}
        existingMeetingIds={config.meetings.map((meeting) => meeting.id)}
        onScheduled={handleScheduled}
        onCancel={exitToView}
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
      onSetMode={changeMode}
      onShare={handleShare}
      onRemoveLocation={removeLocation}
      modePanelContent={modePanelContent}
      toastMessage={toastMessage}
      previewOffsetMs={canScrub ? scrubOffsetMs : 0}
      scrubBind={canScrub ? scrubBindWithGate : undefined}
      isScrubbing={isScrubbing}
      isGoogleCalendarConnected={isConnectedToGoogleCalendar}
    />
  );
}

export default App;

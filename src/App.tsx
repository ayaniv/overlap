import { useCallback, useMemo, useRef, useState } from 'react';
import { AddLocationForm } from './clock/AddLocationForm';
import { DEFAULT_MEETING_DURATION_MINUTES, isGoogleCalendarConnected, scheduleMeetingOnGoogleCalendar } from './clock/googleCalendar';
import { buildMeeting, buildOverlapMeetingTitle, findMeetingAtInstant } from './clock/meetingForm';
import { ScheduleForm } from './clock/ScheduleForm';
import { shareLink } from './clock/share';
import type { ShareOutcome } from './clock/share';
import { useRingScrub } from './clock/useRingScrub';
import { WorldClock } from './clock/WorldClock';
import type { Meeting, Mode } from './clock/types';
import type { RingScrubBind } from './clock/useRingScrub';
import { useClockConfig } from './hooks/useClockConfig';
import { useIsPortrait } from './hooks/useIsPortrait';
import { useNow } from './hooks/useNow';
import { useToast } from './hooks/useToast';

const SHARE_TOAST_MESSAGE: Partial<Record<ShareOutcome, string>> = {
  copied: 'Link copied',
  failed: "Couldn't copy link",
};

const MARK_SCRUBBED_DEBOUNCE_MS = 300;
// how close the scrub preview needs to land to an existing meeting's instant to
// surface it in the schedule panel — a window, not exact equality, since scrubbing
// (especially a continuous drag) rarely lands on the exact millisecond a meeting
// was scheduled at
const MEETING_MATCH_TOLERANCE_MS = 5 * 60_000;

function App() {
  const now = useNow();
  const { config, addLocation, removeLocation, addMeeting, removeMeeting, reorder } = useClockConfig();
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
  // ControlCluster's menu is otherwise self-contained (toggled by its own X
  // button), but starting a scrub should reveal it too — see markScrubbed below
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  // on the portrait/mobile layout (M5) the clock already dominates the narrow
  // viewport, so scrubbing there stays a quiet "what if" preview only — the
  // schedule panel opens exclusively via an explicit tap on ControlCluster's
  // Schedule button. Landscape/desktop keeps the auto-open behavior below.
  const isPortrait = useIsPortrait();
  // isGoogleCalendarConnected() reads localStorage; read it once on mount rather
  // than on every render (App re-renders every second via useNow's tick) — it only
  // ever changes at the one moment a schedule attempt succeeds, so handleScheduled
  // below re-reads it right there instead of polling it on a timer
  const [isConnectedToGoogleCalendar, setIsConnectedToGoogleCalendar] = useState(() => isGoogleCalendarConnected());
  // guards the mobile quick-schedule action (ControlCluster's scrub Schedule
  // button) against a second concurrent request while the first is still
  // in flight — there's no form/disabled-fieldset to lean on here
  const [isQuickScheduling, setIsQuickScheduling] = useState(false);

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

  // memoized (mirrors WorldClock's effectiveNow) so matchedMeeting below only
  // recomputes when the previewed instant actually moves, not on every render —
  // App re-renders ~1x/sec via `now`'s own tick (useNow), and without this,
  // `new Date(...)` would produce a fresh object every time, defeating that memo
  const previewInstant = useMemo(() => new Date(now.getTime() + scrubOffsetMs), [now, scrubOffsetMs]);

  const handleChangeInstant = useCallback(
    (instant: Date) => setOffsetMs(instant.getTime() - now.getTime()),
    [setOffsetMs, now],
  );

  // surfaces an already-scheduled meeting in the schedule panel when the preview
  // lands on it — gated the same way meeting dots are (isGoogleCalendarConnected):
  // `meetings` rides along in the shareable config, so a share-link viewer who's
  // never signed in on this device shouldn't see the owner's meeting details either.
  // Memoized because this otherwise re-scans config.meetings on every render,
  // including the once-a-second clock tick.
  const matchedMeeting = useMemo(
    () =>
      isConnectedToGoogleCalendar ? findMeetingAtInstant(config.meetings, previewInstant, MEETING_MATCH_TOLERANCE_MS) : undefined,
    [isConnectedToGoogleCalendar, config.meetings, previewInstant],
  );

  const handleDeleteMeeting = useCallback((id: string) => removeMeeting(id), [removeMeeting]);

  // desktop auto-open (markScrubbed below) only — mobile's ControlCluster
  // scrub buttons (Cancel/Schedule) bypass this panel entirely, see
  // handleQuickSchedule/handleBackToNow
  const openScheduleModePanel = useCallback(() => {
    setMode((current) => (current === 'view' ? 'schedule' : current));
    // reveal the ControlCluster menu too, in case it's still collapsed — otherwise
    // the schedule panel opens with no visible (highlighted) Schedule button
    setIsMenuExpanded(true);
  }, []);

  // mobile ControlCluster's scrub "Cancel" tap — only rendered while mode is
  // still 'view' (see WorldClock's isScrubActionBarVisible), so unlike exitToView
  // there's no panel/mode to unwind here, just the preview offset itself
  const handleBackToNow = useCallback(() => {
    resetScrub();
    setHasScrubbed(false);
  }, [resetScrub]);

  // mobile ControlCluster's scrub "Schedule" tap: schedules immediately at the
  // previewed instant instead of opening ScheduleForm — fixed 30-minute duration,
  // title auto-generated from whichever locations currently overlap (see
  // buildOverlapMeetingTitle). Mirrors ScheduleForm.handleSubmit's
  // sign-in-then-create-event flow and error handling, just without a form to
  // read a title/duration from or show an inline error in.
  const handleQuickSchedule = useCallback(async () => {
    if (isQuickScheduling) return;
    setIsQuickScheduling(true);
    const title = buildOverlapMeetingTitle(previewInstant, config.home, config.rings);
    try {
      const googleEventId = await scheduleMeetingOnGoogleCalendar(title, previewInstant.toISOString(), DEFAULT_MEETING_DURATION_MINUTES);
      const existingIds = config.meetings.map((meeting) => meeting.id);
      handleScheduled(buildMeeting(title, previewInstant, existingIds, googleEventId));
      showToast('Meeting scheduled');
      resetScrub();
      setHasScrubbed(false);
    } catch (err) {
      console.error('overlap: failed to quick-schedule a meeting from the scrub buttons', err);
      showToast(err instanceof Error ? err.message : 'Could not schedule the meeting.');
    } finally {
      setIsQuickScheduling(false);
    }
  }, [isQuickScheduling, previewInstant, config.home, config.rings, config.meetings, handleScheduled, showToast, resetScrub]);

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
    // hasScrubbed is set regardless of orientation, so a user who scrubs in portrait
    // and then explicitly opens Schedule doesn't hit the scrub-gate again
    setHasScrubbed(true);
    // on mobile/portrait, scrubbing stays a quiet "what if" preview (see isPortrait's
    // doc comment above) — the schedule panel opens only via an explicit tap, either
    // ControlCluster's Schedule icon or the scrub action bar's "Schedule" button
    if (isPortrait) return;
    openScheduleModePanel();
  }, [isPortrait, openScheduleModePanel]);

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
        matchedMeeting={matchedMeeting}
        onDeleteMeeting={handleDeleteMeeting}
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
      isMenuExpanded={isMenuExpanded}
      onMenuExpandedChange={setIsMenuExpanded}
      onRemoveLocation={removeLocation}
      onReorder={reorder}
      modePanelContent={modePanelContent}
      toastMessage={toastMessage}
      previewOffsetMs={canScrub ? scrubOffsetMs : 0}
      scrubBind={canScrub ? scrubBindWithGate : undefined}
      isScrubbing={isScrubbing}
      isGoogleCalendarConnected={isConnectedToGoogleCalendar}
      onQuickSchedule={handleQuickSchedule}
      onBackToNow={handleBackToNow}
      isQuickScheduling={isQuickScheduling}
    />
  );
}

export default App;

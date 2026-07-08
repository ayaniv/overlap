import { useCallback, useMemo, useState } from 'react';
import { AddLocationForm } from './clock/AddLocationForm';
import {
  DEFAULT_MEETING_DURATION_MINUTES,
  deleteMeetingFromGoogleCalendar,
  isGoogleCalendarConnected,
  scheduleMeetingOnGoogleCalendar,
} from './clock/googleCalendar';
import { buildMeeting, buildOverlapMeetingTitle, findMeetingAtInstant } from './clock/meetingForm';
import { shareLink } from './clock/share';
import type { ShareOutcome } from './clock/share';
import { useRingScrub } from './clock/useRingScrub';
import { WorldClock } from './clock/WorldClock';
import type { Mode } from './clock/types';
import { useClockConfig } from './hooks/useClockConfig';
import { useIsPortrait } from './hooks/useIsPortrait';
import { useNow } from './hooks/useNow';
import { useToast } from './hooks/useToast';

const SHARE_TOAST_MESSAGE: Partial<Record<ShareOutcome, string>> = {
  copied: 'Link copied',
  failed: "Couldn't copy link",
};

// how close the scrub preview needs to land to an existing meeting's instant to
// surface it (as ControlCluster's extra "Remove Meeting" button) — a window,
// not exact equality, since scrubbing (especially a continuous drag) rarely
// lands on the exact millisecond a meeting was scheduled at
const MEETING_MATCH_TOLERANCE_MS = 5 * 60_000;

function App() {
  const now = useNow();
  const { config, addLocation, removeLocation, updateLocation, setHome, addMeeting, removeMeeting, reorder } = useClockConfig();
  const [mode, setMode] = useState<Mode>('view');
  const { message: toastMessage, showToast } = useToast();
  const { previewOffsetMs: scrubOffsetMs, isDragging: isScrubbing, reset: resetScrub, bind: scrubBind } = useRingScrub();
  const canScrub = mode !== 'edit';
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  const isPortrait = useIsPortrait();
  // isGoogleCalendarConnected() reads localStorage; read it once on mount rather
  // than on every render (App re-renders every second via useNow's tick) — it only
  // ever changes at the one moment a schedule attempt succeeds, so handleQuickSchedule
  // below re-reads it right there instead of polling it on a timer
  const [isConnectedToGoogleCalendar, setIsConnectedToGoogleCalendar] = useState(() => isGoogleCalendarConnected());
  // guards the quick-schedule/remove-meeting actions (ControlCluster's scrub
  // buttons) against a second concurrent request while the first is still in
  // flight — there's no form/disabled-fieldset to lean on here
  const [isQuickScheduling, setIsQuickScheduling] = useState(false);
  const [isRemovingMeeting, setIsRemovingMeeting] = useState(false);

  const handleShare = useCallback(() => {
    void shareLink(navigator, navigator.clipboard, window.location.href).then((outcome) => {
      // "shared" (native share sheet shown) and "cancelled" (user dismissed it)
      // get no toast — the OS UI already gave feedback, or there's nothing to report
      const message = SHARE_TOAST_MESSAGE[outcome];
      if (message) showToast(message);
    });
  }, [showToast]);

  // memoized (mirrors WorldClock's effectiveNow) so matchedMeeting below only
  // recomputes when the previewed instant actually moves, not on every render —
  // App re-renders ~1x/sec via `now`'s own tick (useNow), and without this,
  // `new Date(...)` would produce a fresh object every time, defeating that memo
  const previewInstant = useMemo(() => new Date(now.getTime() + scrubOffsetMs), [now, scrubOffsetMs]);

  // surfaces an already-scheduled meeting via ControlCluster's extra "Remove
  // Meeting" scrub button — gated the same way meeting dots are
  // (isGoogleCalendarConnected): `meetings` rides along in the shareable
  // config, so a share-link viewer who's never signed in on this device
  // shouldn't see the owner's meeting details either. Memoized because this
  // otherwise re-scans config.meetings on every render, including the
  // once-a-second clock tick.
  const matchedMeeting = useMemo(
    () =>
      isConnectedToGoogleCalendar ? findMeetingAtInstant(config.meetings, previewInstant, MEETING_MATCH_TOLERANCE_MS) : undefined,
    [isConnectedToGoogleCalendar, config.meetings, previewInstant],
  );

  // ControlCluster's scrub "Schedule": schedules immediately at the previewed
  // instant — fixed 30-minute duration, title auto-generated from whichever
  // locations currently overlap (see buildOverlapMeetingTitle). No form: this
  // is the only way to schedule a meeting now, on either platform.
  const handleQuickSchedule = useCallback(async () => {
    if (isQuickScheduling) return;
    setIsQuickScheduling(true);
    const title = buildOverlapMeetingTitle(previewInstant, config.home, config.rings);
    try {
      const googleEventId = await scheduleMeetingOnGoogleCalendar(title, previewInstant.toISOString(), DEFAULT_MEETING_DURATION_MINUTES);
      const existingIds = config.meetings.map((meeting) => meeting.id);
      addMeeting(buildMeeting(title, previewInstant, existingIds, googleEventId));
      // scheduling only succeeds after a successful Google sign-in (see
      // scheduleMeetingOnGoogleCalendar) — that's exactly the moment the
      // connected flag flips, so re-read it here instead of polling it
      setIsConnectedToGoogleCalendar(isGoogleCalendarConnected());
      showToast('Meeting scheduled');
      resetScrub();
    } catch (err) {
      console.error('overlap: failed to quick-schedule a meeting from the scrub buttons', err);
      showToast(err instanceof Error ? err.message : 'Could not schedule the meeting.');
    } finally {
      setIsQuickScheduling(false);
    }
  }, [isQuickScheduling, previewInstant, config.home, config.rings, config.meetings, addMeeting, showToast, resetScrub]);

  // ControlCluster's scrub "Remove Meeting" (only present when matchedMeeting
  // is set): mirrors handleQuickSchedule's sign-in-then-mutate flow and error
  // handling, just deleting instead of creating
  const handleRemoveMatchedMeeting = useCallback(async () => {
    if (!matchedMeeting || isRemovingMeeting) return;
    setIsRemovingMeeting(true);
    try {
      // a meeting with no googleEventId (pre-migration, or synced in from someone
      // else's share link) is still removable locally — just skip the Calendar call
      if (matchedMeeting.googleEventId) {
        await deleteMeetingFromGoogleCalendar(matchedMeeting.googleEventId);
      }
      removeMeeting(matchedMeeting.id);
      showToast('Meeting removed');
      resetScrub();
    } catch (err) {
      console.error('overlap: failed to remove the matched meeting from the scrub buttons', err);
      showToast(err instanceof Error ? err.message : 'Could not remove the meeting.');
    } finally {
      setIsRemovingMeeting(false);
    }
  }, [matchedMeeting, isRemovingMeeting, removeMeeting, showToast, resetScrub]);

  const modePanelContent =
    mode === 'edit' ? (
      <AddLocationForm
        existingIds={[config.home.id, ...config.rings.map((location) => location.id)]}
        existingColors={[config.home.color, ...config.rings.map((location) => location.color)]}
        onAdd={addLocation}
        onDone={() => setMode('view')}
        isPortrait={isPortrait}
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
      isMenuExpanded={isMenuExpanded}
      onMenuExpandedChange={setIsMenuExpanded}
      onRemoveLocation={removeLocation}
      onReorder={reorder}
      onUpdateLocation={updateLocation}
      onSetHome={setHome}
      modePanelContent={modePanelContent}
      toastMessage={toastMessage}
      previewOffsetMs={canScrub ? scrubOffsetMs : 0}
      scrubBind={canScrub ? scrubBind : undefined}
      isScrubbing={isScrubbing}
      isGoogleCalendarConnected={isConnectedToGoogleCalendar}
      onQuickSchedule={handleQuickSchedule}
      onBackToNow={resetScrub}
      isQuickScheduling={isQuickScheduling}
      hasMatchedMeeting={Boolean(matchedMeeting)}
      onRemoveMeeting={handleRemoveMatchedMeeting}
      isRemovingMeeting={isRemovingMeeting}
      isPortrait={isPortrait}
    />
  );
}

export default App;

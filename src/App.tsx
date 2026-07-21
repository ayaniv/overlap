import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAnalytics } from './analytics/AnalyticsProvider';
import { useLogger } from './logger/LoggerProvider';
import { AddLocationForm } from './clock/AddLocationForm';
import {
  DEFAULT_MEETING_DURATION_MINUTES,
  deleteMeetingFromGoogleCalendar,
  isGoogleCalendarConnected,
  scheduleMeetingOnGoogleCalendar,
} from './clock/googleCalendar';
import { findBestMeetingOffset } from './clock/findMeetingTime';
import type { FindMeetingTimeResult } from './clock/findMeetingTime';
import { buildMeeting, buildOverlapMeetingTitle, findMeetingAtInstant } from './clock/meetingForm';
import { hasSeenScrubHint, markScrubHintSeen } from './clock/scrubHint';
import { shareLink } from './clock/share';
import type { ShareOutcome } from './clock/share';
import { useFindMeetingTimeSweep } from './clock/useFindMeetingTimeSweep';
import { useRingScrub } from './clock/useRingScrub';
import { useScrubHintDemo } from './clock/useScrubHintDemo';
import { useScrubHintReturn } from './clock/useScrubHintReturn';
import { WorldClock } from './clock/WorldClock';
import type { Location, Mode } from './clock/types';
import { useClockConfig } from './hooks/useClockConfig';
import { useIsIdle } from './hooks/useIsIdle';
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
  const analytics = useAnalytics();
  const logger = useLogger();
  const now = useNow();
  const { config, addLocation, removeLocation, updateLocation, setHome, addMeeting, removeMeeting, reorder } = useClockConfig();
  const [mode, setMode] = useState<Mode>('view');
  const { message: toastMessage, showToast } = useToast();
  const {
    previewOffsetMs: scrubOffsetMs,
    isDragging: isScrubbing,
    reset: resetScrub,
    setOffsetMs: scrubSetOffsetMs,
    bind: scrubBind,
  } = useRingScrub();
  const canScrub = mode !== 'edit';
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  const isPortrait = useIsPortrait();
  const isIdle = useIsIdle();
  const [isScrubHintUnseen, setIsScrubHintUnseen] = useState(() => !hasSeenScrubHint());
  // full gate for "is the hint actually visible/animating right now" — the
  // narrower `isScrubHintUnseen` state only tracks permanent dismissal. Shown
  // by default (like the header/title/ControlCluster chrome) and hidden by
  // the same ambient-idle mechanism, rather than waiting for a first touch.
  // `!isScrubbing` closes a same-render race: if the activity that clears
  // `isIdle` (resuming from an ambient/idle state) is itself a real pointer
  // drag already in progress, useRingScrub's onPointerDown already set
  // isScrubbing true in that same event/render, so this stays false instead
  // of transiently yanking scrubBind out from under it.
  const isScrubHintActive = isScrubHintUnseen && mode === 'view' && !isIdle && !isScrubbing;
  // true from the "Got it" click until the clock finishes easing back to now.
  // The demo sweep is gated off while this runs: if the user dismisses
  // mid-sweep, both rAF loops would otherwise fight over the same offset.
  const [isDismissingScrubHint, setIsDismissingScrubHint] = useState(false);
  useScrubHintDemo({ active: isScrubHintActive && !isDismissingScrubHint, setOffsetMs: scrubSetOffsetMs });

  // fires once per actual appearance — the effect only re-runs when
  // isScrubHintActive changes (including the very first render, if it's
  // already true on load), not on every render while it stays visible
  useEffect(() => {
    if (isScrubHintActive) {
      analytics.trackEvent('scrub_hint_shown');
    }
  }, [isScrubHintActive, analytics]);

  // falls back to real "now" if idle kicks in while the hint would otherwise
  // be animating, so an unattended ambient display never freezes mid-sweep;
  // isIdle can't become true while a real drag is in progress (any pointer
  // activity continuously resets useIsIdle's own timer), so this never fires
  // mid-real-scrub
  const wasIdleRef = useRef(isIdle);
  useEffect(() => {
    const wasIdle = wasIdleRef.current;
    wasIdleRef.current = isIdle;
    if (!wasIdle && isIdle && isScrubHintUnseen) {
      // also cancels an in-flight return animation, so it can't keep driving
      // the offset against an overlay that idle has already torn down
      setIsDismissingScrubHint(false);
      resetScrub();
    }
  }, [isIdle, isScrubHintUnseen, resetScrub]);

  // the flag is persisted here rather than on completion: a reload part-way
  // through the return animation must not resurrect a hint the user has
  // explicitly dismissed. Only the on-screen teardown waits for the animation.
  const handleDismissScrubHint = useCallback(() => {
    // the button stays mounted and hit-testable for the length of the return
    // animation, so a second click would otherwise re-fire the analytics event
    // (the state writes below are already idempotent)
    if (isDismissingScrubHint) return;
    markScrubHintSeen();
    setIsDismissingScrubHint(true);
    analytics.trackEvent('scrub_hint_dismissed');
  }, [isDismissingScrubHint, analytics]);

  const handleScrubHintReturnComplete = useCallback(() => {
    setIsDismissingScrubHint(false);
    setIsScrubHintUnseen(false);
    resetScrub();
  }, [resetScrub]);

  useScrubHintReturn({
    active: isDismissingScrubHint,
    fromOffsetMs: scrubOffsetMs,
    setOffsetMs: scrubSetOffsetMs,
    onComplete: handleScrubHintReturnComplete,
  });

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
  // scrubbing isn't gated by isQuickScheduling/isRemovingMeeting (only ControlCluster's
  // buttons are, via isBusy) — the ring itself stays draggable while a schedule/remove
  // request is in flight. Kept in sync with scrubOffsetMs on every render so
  // handleQuickSchedule/handleRemoveMatchedMeeting can tell, once their await resolves,
  // whether the user has since scrubbed elsewhere — and skip resetScrub() if so, instead
  // of silently snapping a newer preview back to "now"
  const liveScrubOffsetRef = useRef(scrubOffsetMs);
  liveScrubOffsetRef.current = scrubOffsetMs;

  // Find Time: excludedRingIds tracks which ring cities the developer has
  // unchecked out of the current search (reset to empty on every fresh
  // "Find Time" click — see handleFindTime); findResult holds the last
  // search's classification, used both to render the 3-state ring arcs and
  // to know whether the scrub action bar/checkboxes should be showing at all
  // (isFindResultActive) even at offset 0 (an already-perfect "now").
  const [excludedRingIds, setExcludedRingIds] = useState<Set<string>>(() => new Set());
  const [findResult, setFindResult] = useState<FindMeetingTimeResult | null>(null);
  const isFindResultActive = findResult !== null;
  const findResultStatusById = useMemo(
    () => (findResult ? Object.fromEntries(findResult.cityResults.map((result) => [result.id, result.status])) : undefined),
    [findResult],
  );

  // drives the eased sweep to a found offset; `sweepTarget` is the trigger
  // (non-null while animating), `sweepFromRef` snapshots where the preview
  // was standing at the moment a search fired, mirroring the scrub-hint
  // return animation's own from/to handling
  const [sweepTarget, setSweepTarget] = useState<number | null>(null);
  const sweepFromRef = useRef(0);
  useFindMeetingTimeSweep({
    active: sweepTarget !== null,
    fromOffsetMs: sweepFromRef.current,
    toOffsetMs: sweepTarget ?? 0,
    setOffsetMs: scrubSetOffsetMs,
    onComplete: () => setSweepTarget(null),
  });

  // shared by handleFindTime and handleToggleRingIncluded — runs the search
  // over exactly the given rings, lands (or re-lands) the clock there, and
  // records the result for the 3-state arcs/checkboxes. useFindMeetingTimeSweep
  // snapshots its target once per activation and won't redirect mid-flight (its
  // effect only re-runs when `active` itself flips), so simply setting a new
  // sweepTarget while one is already non-null wouldn't actually retarget the
  // running animation — it'd keep easing toward the stale first target. Ring
  // checkboxes are interactive the instant a result lands (not gated on the
  // sweep finishing), so a re-entrant call here is a real scenario, not just a
  // test artifact: cancel the in-flight sweep (setSweepTarget(null) flips
  // `active` false, which lets useFindMeetingTimeSweep's cleanup cancel the
  // pending frame) and snap straight to the new target instead of animating,
  // then arm a fresh sweep from there on the next call.
  const runFindMeetingTime = useCallback(
    (rings: Location[]) => {
      const result = findBestMeetingOffset(now, config.home, rings);
      if (sweepTarget !== null) {
        setSweepTarget(null);
        scrubSetOffsetMs(result.offsetMs);
      } else {
        sweepFromRef.current = scrubOffsetMs;
        setSweepTarget(result.offsetMs);
      }
      setFindResult(result);
      return result;
    },
    [sweepTarget, now, config.home, scrubOffsetMs, scrubSetOffsetMs],
  );

  // when a checked ring structurally can't be reconciled with home at all
  // (see findBestMeetingOffset's home-priority bound), its status comes back
  // 'out' even though its checkbox is still checked -- auto-unchecking it
  // here keeps the checkboxes honest about what's actually achieved, and
  // re-runs the search over the reduced set so the result reflects the
  // maximum reachable among the cities that remain. `findBestMeetingOffset`
  // never lets a ring that can't intersect home's bound contribute to the
  // sweep in the first place, so removing it from `includedRings` never
  // changes the chosen offset — only which cities are counted/checked.
  const autoExcludeUnfitRings = useCallback(
    (result: FindMeetingTimeResult, previousExcluded: Set<string>): FindMeetingTimeResult => {
      const unfitRingIds = result.cityResults.filter((c) => c.id !== config.home.id && c.status === 'out').map((c) => c.id);
      if (unfitRingIds.length === 0) return result;
      const nextExcluded = new Set(previousExcluded);
      unfitRingIds.forEach((id) => nextExcluded.add(id));
      setExcludedRingIds(nextExcluded);
      const reducedRings = config.rings.filter((ring) => !nextExcluded.has(ring.id));
      return runFindMeetingTime(reducedRings);
    },
    [config.home.id, config.rings, runFindMeetingTime],
  );

  const handleFindTime = useCallback(() => {
    setExcludedRingIds(new Set());
    const initialResult = runFindMeetingTime(config.rings);
    const result = autoExcludeUnfitRings(initialResult, new Set());
    analytics.trackEvent('find_meeting_time_clicked', {
      ring_count: config.rings.length,
      fit_count: result.fitCount,
      perfect_count: result.perfectCount,
      is_perfect: result.perfectCount === result.totalCount,
    });
  }, [config.rings, runFindMeetingTime, autoExcludeUnfitRings, analytics]);

  // clears the find-result state alongside a real resetScrub() — used
  // everywhere Cancel/Schedule/Remove-Meeting already return the clock to
  // "now", so a landed find result never lingers (stale checkboxes/arcs)
  // once the developer has backed out of it
  const clearFindResult = useCallback(() => {
    setFindResult(null);
    setExcludedRingIds(new Set());
    setSweepTarget(null);
  }, []);

  const handleBackToNow = useCallback(() => {
    resetScrub();
    clearFindResult();
  }, [resetScrub, clearFindResult]);

  const handleToggleRingIncluded = useCallback(
    (id: string) => {
      const wasExcluded = excludedRingIds.has(id);
      const nextExcluded = new Set(excludedRingIds);
      if (wasExcluded) nextExcluded.delete(id);
      else nextExcluded.add(id);

      const includedRings = config.rings.filter((ring) => !nextExcluded.has(ring.id));
      // unchecking the last remaining ring leaves nothing to search a meeting
      // over. Disabling that checkbox to prevent this reads as broken (a
      // fully-interactive-looking control the user can't actually operate),
      // so instead let it through and treat it exactly like Cancel/Back-to-now
      if (includedRings.length === 0) {
        analytics.trackEvent('find_meeting_time_city_excluded', { remaining_count: 0 });
        handleBackToNow();
        return;
      }

      setExcludedRingIds(nextExcluded);
      const initialResult = runFindMeetingTime(includedRings);
      const result = autoExcludeUnfitRings(initialResult, nextExcluded);
      analytics.trackEvent(wasExcluded ? 'find_meeting_time_city_included' : 'find_meeting_time_city_excluded', {
        remaining_count: result.totalCount - 1,
      });
    },
    [excludedRingIds, config.rings, runFindMeetingTime, autoExcludeUnfitRings, analytics, handleBackToNow],
  );

  const handleShare = useCallback(() => {
    void shareLink(navigator, navigator.clipboard, window.location.href).then((outcome) => {
      // "shared" (native share sheet shown) and "cancelled" (user dismissed it)
      // get no toast — the OS UI already gave feedback, or there's nothing to report
      const message = SHARE_TOAST_MESSAGE[outcome];
      if (message) showToast(message);
      analytics.trackEvent('clock_shared', { outcome });
    });
  }, [showToast, analytics]);

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
    const startOffsetMs = scrubOffsetMs;
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
      analytics.trackEvent('meeting_scheduled', { duration_minutes: DEFAULT_MEETING_DURATION_MINUTES });
      // only return to "now" if the user hasn't scrubbed elsewhere while this request
      // was in flight — otherwise this would silently discard their newer preview
      if (liveScrubOffsetRef.current === startOffsetMs) {
        resetScrub();
        clearFindResult();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not schedule the meeting.');
      logger.error(err, 'failed to quick-schedule a meeting from the scrub buttons');
    } finally {
      setIsQuickScheduling(false);
    }
  }, [isQuickScheduling, scrubOffsetMs, previewInstant, config.home, config.rings, config.meetings, addMeeting, showToast, resetScrub, clearFindResult, analytics, logger]);

  // ControlCluster's scrub "Remove Meeting" (only present when matchedMeeting
  // is set): mirrors handleQuickSchedule's sign-in-then-mutate flow and error
  // handling, just deleting instead of creating
  const handleRemoveMatchedMeeting = useCallback(async () => {
    if (!matchedMeeting || isRemovingMeeting) return;
    setIsRemovingMeeting(true);
    const startOffsetMs = scrubOffsetMs;
    try {
      // a meeting with no googleEventId (pre-migration, or synced in from someone
      // else's share link) is still removable locally — just skip the Calendar call
      if (matchedMeeting.googleEventId) {
        await deleteMeetingFromGoogleCalendar(matchedMeeting.googleEventId);
      }
      removeMeeting(matchedMeeting.id);
      showToast('Meeting removed');
      analytics.trackEvent('meeting_deleted');
      // only return to "now" if the user hasn't scrubbed elsewhere while this request
      // was in flight — otherwise this would silently discard their newer preview
      if (liveScrubOffsetRef.current === startOffsetMs) {
        resetScrub();
        clearFindResult();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not remove the meeting.');
      logger.error(err, 'failed to remove the matched meeting from the scrub buttons');
    } finally {
      setIsRemovingMeeting(false);
    }
  }, [matchedMeeting, isRemovingMeeting, scrubOffsetMs, removeMeeting, showToast, resetScrub, clearFindResult, analytics, logger]);

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
      scrubBind={canScrub && !isScrubHintActive ? scrubBind : undefined}
      isScrubbing={isScrubbing}
      isGoogleCalendarConnected={isConnectedToGoogleCalendar}
      onQuickSchedule={handleQuickSchedule}
      onBackToNow={handleBackToNow}
      isQuickScheduling={isQuickScheduling}
      hasMatchedMeeting={Boolean(matchedMeeting)}
      onRemoveMeeting={handleRemoveMatchedMeeting}
      isRemovingMeeting={isRemovingMeeting}
      isPortrait={isPortrait}
      isIdle={isIdle}
      isScrubHintVisible={isScrubHintActive}
      onDismissScrubHint={handleDismissScrubHint}
      isScrubHintDismissing={isDismissingScrubHint}
      onFindTime={handleFindTime}
      isFindResultActive={isFindResultActive}
      findResultStatusById={findResultStatusById}
      excludedRingIds={excludedRingIds}
      onToggleRingIncluded={handleToggleRingIncluded}
    />
  );
}

export default App;

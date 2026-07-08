import { useId, useMemo, useRef } from 'react';
import {
  bezelBaseRadius,
  bezelTicks,
  CENTER,
  directionChevrons,
  handAngle,
  hexToRgba,
  labelArcHalfLength,
  labelArcPath,
  LABEL_RADIUS_OFFSET,
  meetingAngle,
  MS_PER_HOUR,
  parseMeetingInstant,
  pointOnCircle,
  ringRadius,
  sweepHandDotRadius,
  sweepHandInnerRadius,
  sweepHandOuterRadius,
  topMarkerApexY,
  topMarkerPoints,
  workingHoursArcPath,
} from './geometry';
import type { Point } from './geometry';
import { getCityDateKey, getCityDateLabel, getCityTime, isWithinWorkingHours } from './cityTime';
import { useIsIdle } from '../hooks/useIsIdle';
import { useSweepAngle } from './useSweepAngle';
import { ConfigPanel } from './ConfigPanel';
import { ControlCluster } from './ControlCluster';
import { ManageLocationsList } from './ManageLocationsList';
import { Toast } from './Toast';
import type { RingScrubBind } from './useRingScrub';
import type { Location, Meeting, Mode } from './types';
import type { ReactNode } from 'react';
import styles from './WorldClock.module.css';

const IN_HOURS_DOT_COLOR = '#FFFFFF';
const OUT_OF_HOURS_DOT_COLOR = '#5E626B';
const IN_HOURS_LABEL_COLOR = '#F4F3EF';
const OUT_OF_HOURS_LABEL_COLOR = '#7C808A';
const HOME_DOT_RADIUS = 5.5;
const WORLD_DOT_RADIUS = 5;
const MEETING_DOT_RADIUS = 6;
const MEETING_DOT_COLOR = '#F472B6';
const STATUS_GOOD_THRESHOLD = 3;
const STATUS_GOOD_COLOR = '#34D399';
const STATUS_PARTIAL_COLOR = '#FBBF4B';
const STATUS_NONE_COLOR = '#565B64';
// clarifies what the colored ring segments mean — otherwise nothing on
// screen ties "colored arc" to "that location's local working hours"
const RING_COLOR_LEGEND_TEXT = '• In colors — local working hours';
const LABEL_DOT_GAP = 18;
// the dial reads one full rotation as +/-24h from now (DEGREES_PER_HOUR * 24 = 360deg);
// used only as the ARIA slider's advertised range, since the underlying offset itself
// isn't clamped
const SCRUB_RANGE_MS = 24 * MS_PER_HOUR;

export type WorldClockProps = {
  now: Date;
  home: Location;
  rings: Location[];
  meetings: Meeting[];
  mode: Mode;
  onSetMode: (mode: Mode) => void;
  onShare: () => void;
  isMenuExpanded: boolean;
  onMenuExpandedChange: (isExpanded: boolean) => void;
  onRemoveLocation: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  modePanelContent?: ReactNode;
  toastMessage?: string | null;
  previewOffsetMs?: number;
  scrubBind?: RingScrubBind;
  isScrubbing?: boolean;
  // gates meeting dots: `meetings` is mirrored into the shareable URL hash, so
  // without this a share-link viewer who never signed in themselves would still
  // see the owner's scheduled-meeting dots
  isGoogleCalendarConnected?: boolean;
};

export function WorldClock({
  now,
  home,
  rings,
  meetings,
  mode,
  onSetMode,
  onShare,
  isMenuExpanded,
  onMenuExpandedChange,
  onRemoveLocation,
  onReorder,
  modePanelContent,
  toastMessage = null,
  previewOffsetMs = 0,
  scrubBind,
  isScrubbing = false,
  isGoogleCalendarConnected = false,
}: WorldClockProps) {
  const idPrefix = useId();
  // the caller (App.tsx) only passes scrubBind when dragging the rings is currently
  // allowed (not in edit mode) — WorldClock just reflects that, it doesn't re-derive
  // its own mode rule
  const isScrubbable = Boolean(scrubBind);

  // ambient "wall display" mode: fades the header copy, footer status line, and
  // ControlCluster after a stretch of no touch/keystroke/pointer activity, so a
  // clock left running on a wall reads as a clean ambient display rather than an
  // app waiting for input. Only while `mode === 'view'` — fading the chrome out
  // from under an open Config/Schedule panel would strand it with no visible way
  // to close.
  const isIdle = useIsIdle();
  const isChromeHidden = isIdle && mode === 'view';

  // dragging the clock face (useRingScrub) previews a different instant; every
  // ring/arc/dot below reads `effectiveNow` so the whole face reflects the preview.
  // Memoized on purpose, despite `now` already ticking every second: `ringViews` and
  // `meetingDots` below both depend on `effectiveNow` in their own useMemo — without
  // this, effectiveNow would be a fresh object on every render whenever
  // previewOffsetMs is nonzero, defeating those two memos on every incidental
  // re-render (mode/toast/config changes) that leaves `now`/previewOffsetMs
  // unchanged. Confirmed by re-introducing the exact react-hooks/exhaustive-deps
  // warning oxlint raises on both when this is removed.
  const effectiveNow = useMemo(
    () => (previewOffsetMs ? new Date(now.getTime() + previewOffsetMs) : now),
    [now, previewOffsetMs],
  );

  const orderedLocations: Array<Location & { isHome: boolean }> = useMemo(
    () => [...rings.map((location) => ({ ...location, isHome: false })), { ...home, isHome: true }],
    [rings, home],
  );
  const totalRings = orderedLocations.length;
  // manage-locations list reads inside->outside (home first), the reverse of
  // orderedLocations (which renders outside->inside for the SVG rings)
  const manageListLocations = useMemo(() => [...orderedLocations].reverse(), [orderedLocations]);

  const ringViews = useMemo(
    () =>
      orderedLocations.map((location, index) => {
        const radius = ringRadius(index, totalRings);
        const labelRadius = radius + LABEL_RADIUS_OFFSET;
        const time = getCityTime(effectiveNow, location.timezoneId);
        const inHours = isWithinWorkingHours(time.frac, location.workStart, location.workEnd);
        const dotPosition = pointOnCircle(labelRadius, 0);
        return {
          location,
          radius,
          labelRadius,
          time,
          inHours,
          arcPath: workingHoursArcPath(radius, time.frac, location.workStart, location.workEnd),
          topArcPath: labelArcPath(labelRadius),
          dotPosition,
          textPathId: `${idPrefix}-tp-${index}`,
        };
      }),
    [orderedLocations, totalRings, effectiveNow, idPrefix],
  );

  const homeRadius = ringRadius(totalRings - 1, totalRings);
  // driven by `effectiveNow`, matching every other angle on the ring (working-hours
  // arcs, the NOW axis itself): the dot is anchored to the ring's own rotating
  // reference frame, not a fixed screen position, so scrubbing sweeps it around
  // exactly like the rest of the dial — it represents the meeting's fixed instant
  // relative to whatever moment the dial is currently previewing
  // only shows a meeting's dot on the calendar day it actually falls on (home
  // timezone) — the angle alone repeats every 24h, so without this a meeting a day
  // (or more) away would otherwise draw right on top of one happening today
  const meetingDots = useMemo(() => {
    const visibleMeetingDots: Array<{ meeting: Meeting; position: Point }> = [];
    // `meetings` rides along in the shareable config (URL hash/localStorage), so a
    // viewer who hasn't signed in on this device shouldn't see the owner's dots
    if (!isGoogleCalendarConnected) return visibleMeetingDots;
    const viewedDateKey = getCityDateKey(effectiveNow, home.timezoneId);
    for (const meeting of meetings) {
      const instant = parseMeetingInstant(meeting.startISO);
      if (!instant) {
        console.error('overlap: skipping meeting with an invalid startISO', meeting.id, meeting.startISO);
      } else {
        const isOnViewedDate = getCityDateKey(instant, home.timezoneId) === viewedDateKey;
        if (isOnViewedDate) {
          visibleMeetingDots.push({ meeting, position: pointOnCircle(homeRadius, meetingAngle(instant, effectiveNow)) });
        }
      }
    }
    return visibleMeetingDots;
  }, [meetings, homeRadius, effectiveNow, home.timezoneId, isGoogleCalendarConnected]);

  const bezelRadius = bezelBaseRadius(totalRings);
  const ticks = useMemo(() => bezelTicks(bezelRadius), [bezelRadius]);
  // ring radii depend only on index/totalRings (not `now`), so this only needs
  // to recompute when the ring count changes, not every tick like ringViews does
  const chevrons = useMemo(
    () => directionChevrons(Array.from({ length: totalRings }, (_, index) => ringRadius(index, totalRings))),
    [totalRings],
  );
  const arrowAngle = handAngle(now);
  const handRef = useRef<SVGGElement>(null);
  useSweepAngle(handRef);
  const glowFilterId = `${idPrefix}-glow`;
  const fadeLineId = `${idPrefix}-fade-line`;
  const fadeLineTopY = topMarkerApexY(totalRings);

  const homeTime = getCityTime(effectiveNow, home.timezoneId);
  const homeDateLabel = getCityDateLabel(effectiveNow, home.timezoneId);
  // previewOffsetMs itself is never clamped (a long drag or a burst of arrow-key
  // presses can carry it past a single day), but the ARIA slider's advertised range
  // is +/-24h — aria-valuenow must stay within aria-valuemin/aria-valuemax or it's an
  // invalid slider for assistive tech
  const clampedScrubValueMs = Math.min(SCRUB_RANGE_MS, Math.max(-SCRUB_RANGE_MS, previewOffsetMs));

  const availableCount = ringViews.filter((ring) => ring.inHours).length;
  const totalCount = ringViews.length;
  const statusText = availableCount === 0 ? 'No teams available right now' : `${availableCount} of ${totalCount} teams are available now`;
  const statusColor = availableCount === 0 ? STATUS_NONE_COLOR : availableCount >= STATUS_GOOD_THRESHOLD ? STATUS_GOOD_COLOR : STATUS_PARTIAL_COLOR;
  const statusGlow = availableCount === 0 ? 'transparent' : hexToRgba(statusColor, 0.7);

  const summary = ringViews.map((ring) => `${ring.location.label} ${ring.time.label}${ring.inHours ? ', in working hours' : ''}`).join('. ');

  return (
    <section
      className={styles.stage}
      aria-label="World clock — shared working hours across timezones"
      data-chrome-hidden={isChromeHidden || undefined}
    >
      <div className={styles.context} aria-hidden="true">
        <div className={styles.eyebrow}>Overlap&nbsp;Clock</div>
        <div className={styles.headline}>See shared hours instantly</div>
      </div>

      <div className={styles.controlClusterWrap}>
        <ControlCluster
          mode={mode}
          onSetMode={onSetMode}
          onShare={onShare}
          isExpanded={isMenuExpanded}
          onExpandedChange={onMenuExpandedChange}
        />
      </div>
      {mode === 'edit' && modePanelContent && (
        <div className={styles.modePanel}>
          <ConfigPanel
            addLocationContent={modePanelContent}
            manageLocationsContent={
              <ManageLocationsList
                locations={manageListLocations}
                onReorder={onReorder}
                onRemove={onRemoveLocation}
                onClose={() => onSetMode('view')}
              />
            }
          />
        </div>
      )}
      {mode === 'schedule' && modePanelContent && <div className={styles.modePanel}>{modePanelContent}</div>}
      <Toast message={toastMessage} />

      <div
        className={styles.clockContainer}
        data-scrubbable={isScrubbable || undefined}
        data-scrubbing={isScrubbing || undefined}
        tabIndex={isScrubbable ? 0 : undefined}
        role={isScrubbable ? 'slider' : undefined}
        aria-label={
          isScrubbable
            ? 'Drag, or use Up/Down (Shift for hours) to preview a different meeting time'
            : undefined
        }
        aria-valuenow={isScrubbable ? clampedScrubValueMs : undefined}
        aria-valuemin={isScrubbable ? -SCRUB_RANGE_MS : undefined}
        aria-valuemax={isScrubbable ? SCRUB_RANGE_MS : undefined}
        aria-valuetext={isScrubbable ? `Home time ${homeTime.label}` : undefined}
        {...(isScrubbable ? scrubBind : undefined)}
      >
        {/* glass disc sits behind the SVG so the strike line draws on top of it, un-dimmed */}
        <div className={styles.glassDisc} aria-hidden="true" />

        <svg viewBox="0 0 1000 1000" className={styles.svg} aria-hidden="true">
          <defs>
            <filter id={glowFilterId} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
            <linearGradient id={fadeLineId} gradientUnits="userSpaceOnUse" x1={CENTER} y1={fadeLineTopY} x2={CENTER} y2={CENTER}>
              <stop offset="0%" stopColor="#9CA3AF" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#9CA3AF" stopOpacity={0} />
            </linearGradient>
            {ringViews.map((ring) => (
              <path key={ring.textPathId} id={ring.textPathId} d={ring.topArcPath} fill="none" />
            ))}
          </defs>

          {ringViews.map((ring) => (
            <circle key={`base-${ring.location.id}`} cx={500} cy={500} r={ring.radius} fill="none" stroke="#2F323C" strokeWidth={6} />
          ))}

          <g filter={`url(#${glowFilterId})`} opacity={0.5}>
            {ringViews.map((ring) => (
              <path key={`glow-${ring.location.id}`} d={ring.arcPath} fill="none" stroke={ring.location.color} strokeWidth={7} strokeLinecap="round" />
            ))}
          </g>
          {ringViews.map((ring) => (
            <path key={`crisp-${ring.location.id}`} d={ring.arcPath} fill="none" stroke={ring.location.color} strokeWidth={6} strokeLinecap="round" />
          ))}

          {ringViews.map((ring) => {
            const textColor = ring.inHours ? IN_HOURS_LABEL_COLOR : OUT_OF_HOURS_LABEL_COLOR;
            const halfLength = labelArcHalfLength(ring.labelRadius);
            return (
              <g key={`label-${ring.location.id}`}>
                <text fill={textColor} fontFamily="Space Grotesk" fontSize={23} fontWeight={400} letterSpacing="0.4" dominantBaseline="central">
                  <textPath href={`#${ring.textPathId}`} startOffset={halfLength - LABEL_DOT_GAP} textAnchor="end">
                    {ring.location.label}
                  </textPath>
                </text>
                <text fill={textColor} fontFamily="JetBrains Mono, monospace" fontSize={22} fontWeight={400} letterSpacing="0.5" dominantBaseline="central">
                  <textPath href={`#${ring.textPathId}`} startOffset={halfLength + LABEL_DOT_GAP} textAnchor="start">
                    {ring.time.label}
                  </textPath>
                </text>
              </g>
            );
          })}

          {/* subtle guide from the triangle down to the center readout, behind all the dots */}
          <line x1={CENTER} y1={fadeLineTopY} x2={CENTER} y2={CENTER} stroke={`url(#${fadeLineId})`} strokeWidth={1.5} />

          {ringViews.map((ring) => (
            <circle
              key={`dot-${ring.location.id}`}
              cx={ring.dotPosition.x.toFixed(2)}
              cy={ring.dotPosition.y.toFixed(2)}
              r={ring.location.isHome ? HOME_DOT_RADIUS : WORLD_DOT_RADIUS}
              fill={ring.inHours ? IN_HOURS_DOT_COLOR : OUT_OF_HOURS_DOT_COLOR}
              style={{ filter: `drop-shadow(0 0 4px ${ring.inHours ? 'rgba(255,255,255,0.55)' : 'transparent'})` }}
            />
          ))}

          {meetingDots.map(({ meeting, position }) => (
            <circle
              key={`meeting-${meeting.id}`}
              cx={position.x.toFixed(2)}
              cy={position.y.toFixed(2)}
              r={MEETING_DOT_RADIUS}
              fill={MEETING_DOT_COLOR}
              style={{ filter: `drop-shadow(0 0 5px ${hexToRgba(MEETING_DOT_COLOR, 0.7)})` }}
            />
          ))}

          {chevrons.map((chevron, index) => (
            <g key={index} transform={`rotate(${chevron.angle} 500 500)`}>
              <polyline
                points={chevron.points}
                fill="none"
                stroke="#868C97"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={chevron.opacity}
              />
            </g>
          ))}

          {ticks.map((tick, index) =>
            index === 0 ? null : (
              <line
                key={index}
                x1={tick.x1.toFixed(2)}
                y1={tick.y1.toFixed(2)}
                x2={tick.x2.toFixed(2)}
                y2={tick.y2.toFixed(2)}
                stroke={tick.stroke}
                strokeWidth={tick.width}
                strokeLinecap="round"
              />
            ),
          )}

          {/* sole "now" marker: a triangle fixed at 12 o'clock, apex pointing into the dial */}
          <polygon
            points={topMarkerPoints(totalRings)}
            fill="#EDEAE0"
            style={{ filter: 'drop-shadow(0 0 4px rgba(237,234,224,0.6))' }}
          />

          <g ref={handRef} transform={`rotate(${arrowAngle.toFixed(2)} 500 500)`}>
            <line
              x1={500}
              y1={(CENTER - sweepHandOuterRadius(totalRings)).toFixed(2)}
              x2={500}
              y2={(CENTER - sweepHandInnerRadius(totalRings)).toFixed(2)}
              stroke="#EDEAE0"
              strokeWidth={2}
              strokeLinecap="round"
              style={{ filter: 'drop-shadow(0 0 4px rgba(237,234,224,0.6))' }}
            />
            <circle
              cx={500}
              cy={(CENTER - sweepHandDotRadius(totalRings)).toFixed(2)}
              r={2.6}
              fill="#EDEAE0"
              style={{ filter: 'drop-shadow(0 0 5px rgba(237,234,224,0.85))' }}
            />
          </g>
        </svg>

        <div className={styles.centerOverlay} aria-hidden="true">
          <div className={styles.centerLocalLabel}>{home.label.toUpperCase()}</div>
          <div className={styles.centerTime}>{homeTime.label}</div>
          <div className={styles.centerDate}>{homeDateLabel}</div>
        </div>
      </div>

      <div className={styles.statusRow} aria-hidden="true">
        <div className={styles.statusText}>
          <span
            className={styles.statusDot}
            style={{ background: statusColor, boxShadow: availableCount === 0 ? 'none' : `0 0 9px ${statusGlow}` }}
          />
          {statusText}
        </div>
        <div className={styles.legendText}>{RING_COLOR_LEGEND_TEXT}</div>
      </div>

      <p className={styles.srOnly} role="status">
        {home.label} local time {homeTime.label}, {homeDateLabel}. {statusText}. {summary}. {RING_COLOR_LEGEND_TEXT}.
      </p>
    </section>
  );
}

import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  bezelBaseRadius,
  bezelTicks,
  directionChevrons,
  handAngle,
  hexToRgba,
  labelArcPath,
  LABEL_ARC_HALF_SPAN_DEG,
  LABEL_RADIUS_OFFSET,
  meetingAngle,
  parseMeetingInstant,
  pointOnCircle,
  ringRadius,
  STRIKE_BOTTOM_Y,
  strikeTopRadius,
  workingHoursArcPath,
} from './geometry';
import type { Point } from './geometry';
import { getCityDateLabel, getCityTime, isWithinWorkingHours } from './cityTime';
import { useSweepAngle } from './useSweepAngle';
import { ControlCluster } from './ControlCluster';
import type { Location, Meeting, Mode } from './types';
import type { KeyboardEvent, ReactNode } from 'react';
import styles from './WorldClock.module.css';

const IN_HOURS_DOT_COLOR = '#FFFFFF';
const OUT_OF_HOURS_DOT_COLOR = '#5E626B';
const IN_HOURS_LABEL_COLOR = '#F4F3EF';
const OUT_OF_HOURS_LABEL_COLOR = '#7C808A';
const HOME_DOT_RADIUS = 5.5;
const WORLD_DOT_RADIUS = 5;
const MEETING_DOT_RADIUS = 6;
const MEETING_DOT_COLOR = '#F472B6';
// must match the name textPath's startOffset below, so the computed "end of
// the name" angle used to place the remove button lines up with where the
// name is actually drawn
const NAME_TEXT_START_OFFSET_PERCENT = 47;
const NAME_END_ANGLE =
  -LABEL_ARC_HALF_SPAN_DEG + (NAME_TEXT_START_OFFSET_PERCENT / 100) * (2 * LABEL_ARC_HALF_SPAN_DEG);
// small angular gap between the measured end of the name and the remove
// button, and a rough fallback span (degrees) for the one frame before the
// name's real rendered length has been measured
const REMOVE_BUTTON_GAP_DEG = 4;
const FALLBACK_NAME_ANGLE_SPAN_DEG = 20;
const REMOVE_BUTTON_RADIUS = 11;
const REMOVE_BUTTON_CROSS_OFFSET = 4;
const REMOVE_BUTTON_BG_COLOR = '#1C1F27';
const REMOVE_BUTTON_BORDER_COLOR = '#565B64';
const REMOVE_BUTTON_CROSS_COLOR = '#C4C8CF';
const REMOVE_BUTTON_CROSS_WIDTH = 1.6;
const STATUS_GOOD_THRESHOLD = 3;
const STATUS_GOOD_COLOR = '#34D399';
const STATUS_PARTIAL_COLOR = '#FBBF4B';
const STATUS_NONE_COLOR = '#565B64';

const pad = (n: number) => String(n).padStart(2, '0');

export type WorldClockProps = {
  now: Date;
  home: Location;
  rings: Location[];
  meetings: Meeting[];
  mode: Mode;
  onSetMode: (mode: Mode) => void;
  onShare: () => void;
  onRemoveLocation: (id: string) => void;
  modePanelContent?: ReactNode;
};

export function WorldClock({
  now,
  home,
  rings,
  meetings,
  mode,
  onSetMode,
  onShare,
  onRemoveLocation,
  modePanelContent,
}: WorldClockProps) {
  const idPrefix = useId();

  const orderedLocations: Array<Location & { isHome: boolean }> = useMemo(
    () => [...rings.map((location) => ({ ...location, isHome: false })), { ...home, isHome: true }],
    [rings, home],
  );
  const totalRings = orderedLocations.length;

  const ringViews = useMemo(
    () =>
      orderedLocations.map((location, index) => {
        const radius = ringRadius(index, totalRings);
        const labelRadius = radius + LABEL_RADIUS_OFFSET;
        const time = getCityTime(now, location.timezoneId);
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
    [orderedLocations, totalRings, now, idPrefix],
  );

  // measures each ring's actual rendered name width (via the real SVG
  // textPath, not an estimate) so the remove button can sit right at the
  // name's start regardless of label length or font metrics
  const nameTextRefs = useRef(new Map<string, SVGTextPathElement>());
  const [nameWidths, setNameWidths] = useState(new Map<string, number>());
  const ringLabelsKey = ringViews.map((ring) => `${ring.location.id}:${ring.location.label}`).join('|');

  useLayoutEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const next = new Map<string, number>();
      nameTextRefs.current.forEach((el, id) => next.set(id, el.getComputedTextLength()));
      setNameWidths(next);
    };
    measure();
    // the initial measurement can land before the Space Grotesk webfont has
    // swapped in (it loads with display=swap), measuring the narrower
    // fallback font instead — re-measure once the real font is ready
    document.fonts.ready.then(measure);
    return () => {
      cancelled = true;
    };
    // re-measure only when the set of rings or their labels actually change, not every tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ringLabelsKey]);

  const homeRadius = ringRadius(totalRings - 1, totalRings);
  const meetingDots = useMemo(() => {
    const dots: Array<{ meeting: Meeting; position: Point }> = [];
    for (const meeting of meetings) {
      const instant = parseMeetingInstant(meeting.startISO);
      if (!instant) {
        console.error('overlap: skipping meeting with an invalid startISO', meeting.id, meeting.startISO);
        continue;
      }
      dots.push({ meeting, position: pointOnCircle(homeRadius, meetingAngle(instant, now)) });
    }
    return dots;
  }, [meetings, homeRadius, now]);

  const bezelRadius = bezelBaseRadius(totalRings);
  const strikeRadius = strikeTopRadius(totalRings);
  const ticks = useMemo(() => bezelTicks(bezelRadius), [bezelRadius]);
  const chevrons = useMemo(
    () => directionChevrons(ringViews.map((ring) => ring.radius)),
    [ringViews],
  );
  const arrowAngle = handAngle(now);
  const handRef = useRef<SVGGElement>(null);
  useSweepAngle(handRef);
  const glowFilterId = `${idPrefix}-glow`;

  // the remove button is an SVG <g>, not a native <button>, so Enter/Space
  // need an explicit handler to match native button keyboard behavior
  const handleRemoveKeyDown = (event: KeyboardEvent<SVGGElement>, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRemoveLocation(id);
    }
  };

  const homeTime = getCityTime(now, home.timezoneId);
  const homeDateLabel = getCityDateLabel(now, home.timezoneId);

  const availableCount = ringViews.filter((ring) => ring.inHours).length;
  const totalCount = ringViews.length;
  const statusText = availableCount === 0 ? 'No teams free right now' : `${availableCount} of ${totalCount} teams free now`;
  const statusColor = availableCount === 0 ? STATUS_NONE_COLOR : availableCount >= STATUS_GOOD_THRESHOLD ? STATUS_GOOD_COLOR : STATUS_PARTIAL_COLOR;
  const statusGlow = availableCount === 0 ? 'transparent' : hexToRgba(statusColor, 0.7);
  const workLabel = `${pad(home.workStart)}:00–${pad(home.workEnd % 24)}:00`;

  const summary = ringViews.map((ring) => `${ring.location.label} ${ring.time.label}${ring.inHours ? ', in working hours' : ''}`).join('. ');

  return (
    <section className={styles.stage} aria-label="World clock meeting planner">
      <div className={styles.context} aria-hidden="true">
        <div className={styles.eyebrow}>MEETING&nbsp;PLANNER</div>
        <div className={styles.headline}>When can everyone meet today?</div>
      </div>

      <ControlCluster mode={mode} onSetMode={onSetMode} onShare={onShare} />
      {mode !== 'view' && modePanelContent && <div className={styles.modePanel}>{modePanelContent}</div>}

      <div className={styles.clockContainer}>
        {/* glass disc sits behind the SVG so the strike line draws on top of it, un-dimmed */}
        <div className={styles.glassDisc} aria-hidden="true" />

        {/* only decorative when there's no interactive content (the remove buttons, in edit mode) inside it */}
        <svg viewBox="0 0 1000 1000" className={styles.svg} aria-hidden={mode !== 'edit'}>
          <defs>
            <filter id={glowFilterId} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
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

          <line x1={500} y1={500 - strikeRadius} x2={500} y2={STRIKE_BOTTOM_Y} stroke="#565B64" strokeWidth={1.5} />

          {ringViews.map((ring) => {
            const textColor = ring.inHours ? IN_HOURS_LABEL_COLOR : OUT_OF_HOURS_LABEL_COLOR;
            return (
              <g key={`label-${ring.location.id}`}>
                <text fill={textColor} fontFamily="Space Grotesk" fontSize={23} fontWeight={400} letterSpacing="0.4" dominantBaseline="central">
                  <textPath
                    ref={(el) => {
                      if (el) nameTextRefs.current.set(ring.location.id, el);
                      else nameTextRefs.current.delete(ring.location.id);
                    }}
                    href={`#${ring.textPathId}`}
                    startOffset={`${NAME_TEXT_START_OFFSET_PERCENT}%`}
                    textAnchor="end"
                  >
                    {ring.location.label}
                    {'  '}
                  </textPath>
                </text>
                <text fill={textColor} fontFamily="JetBrains Mono, monospace" fontSize={22} fontWeight={400} letterSpacing="0.5" dominantBaseline="central">
                  <textPath href={`#${ring.textPathId}`} startOffset="53%" textAnchor="start">
                    {'  '}
                    {ring.time.label}
                  </textPath>
                </text>
              </g>
            );
          })}

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

          {mode === 'edit' &&
            ringViews
              .filter((ring) => !ring.location.isHome)
              .map((ring) => {
                const nameWidth = nameWidths.get(ring.location.id);
                const nameAngleSpan =
                  nameWidth != null ? (nameWidth / ring.labelRadius) * (180 / Math.PI) : FALLBACK_NAME_ANGLE_SPAN_DEG;
                const removeAngle = NAME_END_ANGLE - nameAngleSpan - REMOVE_BUTTON_GAP_DEG;
                const removePosition = pointOnCircle(ring.labelRadius, removeAngle);
                return (
                  <g
                    key={`remove-${ring.location.id}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${ring.location.label}`}
                    className={styles.removeButton}
                    onClick={() => onRemoveLocation(ring.location.id)}
                    onKeyDown={(event) => handleRemoveKeyDown(event, ring.location.id)}
                  >
                    <circle
                      cx={removePosition.x.toFixed(2)}
                      cy={removePosition.y.toFixed(2)}
                      r={REMOVE_BUTTON_RADIUS}
                      fill={REMOVE_BUTTON_BG_COLOR}
                      stroke={REMOVE_BUTTON_BORDER_COLOR}
                      strokeWidth={1.5}
                    />
                    <line
                      x1={(removePosition.x - REMOVE_BUTTON_CROSS_OFFSET).toFixed(2)}
                      y1={(removePosition.y - REMOVE_BUTTON_CROSS_OFFSET).toFixed(2)}
                      x2={(removePosition.x + REMOVE_BUTTON_CROSS_OFFSET).toFixed(2)}
                      y2={(removePosition.y + REMOVE_BUTTON_CROSS_OFFSET).toFixed(2)}
                      stroke={REMOVE_BUTTON_CROSS_COLOR}
                      strokeWidth={REMOVE_BUTTON_CROSS_WIDTH}
                      strokeLinecap="round"
                    />
                    <line
                      x1={(removePosition.x - REMOVE_BUTTON_CROSS_OFFSET).toFixed(2)}
                      y1={(removePosition.y + REMOVE_BUTTON_CROSS_OFFSET).toFixed(2)}
                      x2={(removePosition.x + REMOVE_BUTTON_CROSS_OFFSET).toFixed(2)}
                      y2={(removePosition.y - REMOVE_BUTTON_CROSS_OFFSET).toFixed(2)}
                      stroke={REMOVE_BUTTON_CROSS_COLOR}
                      strokeWidth={REMOVE_BUTTON_CROSS_WIDTH}
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}

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

          {ticks.map((tick, index) => (
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
          ))}

          <g ref={handRef} transform={`rotate(${arrowAngle.toFixed(2)} 500 500)`}>
            <line
              x1={500}
              y1={40}
              x2={500}
              y2={62}
              stroke="#EDEAE0"
              strokeWidth={2}
              strokeLinecap="round"
              style={{ filter: 'drop-shadow(0 0 4px rgba(237,234,224,0.6))' }}
            />
            <circle cx={500} cy={38} r={2.6} fill="#EDEAE0" style={{ filter: 'drop-shadow(0 0 5px rgba(237,234,224,0.85))' }} />
          </g>
        </svg>

        <div className={styles.centerOverlay} aria-hidden="true">
          <div className={styles.centerLocalLabel}>{home.label.toUpperCase()}</div>
          <div className={styles.centerTime}>{homeTime.label}</div>
          <div className={styles.centerDate}>{homeDateLabel}</div>
        </div>

        {/* NOW sits at the inner (bottom) end of the strike, inside the home ring, above the local time */}
        <div className={styles.nowLabel} aria-hidden="true">
          NOW
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
        <span className={styles.separator} />
        <div className={styles.legend}>Home working hours {workLabel} · local</div>
      </div>

      <p className={styles.srOnly} role="status">
        {home.label} local time {homeTime.label}, {homeDateLabel}. {statusText}. {summary}.
      </p>
    </section>
  );
}

import { useId, useMemo, useRef } from 'react';
import {
  bezelTicks,
  directionChevrons,
  handAngle,
  hexToRgba,
  labelArcHalfLength,
  labelArcPath,
  LABEL_RADIUS_OFFSET,
  meetingAngle,
  parseMeetingInstant,
  pointOnCircle,
  ringRadius,
  topMarkerPoints,
  workingHoursArcPath,
} from './geometry';
import type { Point } from './geometry';
import { getCityDateLabel, getCityTime, isWithinWorkingHours } from './cityTime';
import { useSweepAngle } from './useSweepAngle';
import { ControlCluster } from './ControlCluster';
import { CenterContent } from './CenterContent';
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
const LABEL_DOT_GAP = 18;

const pad = (n: number) => String(n).padStart(2, '0');

export type WorldClockProps = {
  now: Date;
  home: Location;
  rings: Location[];
  meetings: Meeting[];
  mode: Mode;
  onSetMode: (mode: Mode) => void;
  onShare: () => void;
  centerContent?: ReactNode;
};

export function WorldClock({ now, home, rings, meetings, mode, onSetMode, onShare, centerContent }: WorldClockProps) {
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

  const ticks = useMemo(() => bezelTicks(), []);
  const chevrons = useMemo(() => directionChevrons(), []);
  const arrowAngle = handAngle(now);
  const handRef = useRef<SVGGElement>(null);
  useSweepAngle(handRef);
  const glowFilterId = `${idPrefix}-glow`;

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

      <div className={styles.clockContainer}>
        {/* glass disc sits behind the SVG so the strike line draws on top of it, un-dimmed */}
        <div className={styles.glassDisc} aria-hidden="true" />

        <svg viewBox="0 0 1000 1000" className={styles.svg} aria-hidden="true">
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
            points={topMarkerPoints()}
            fill="#EDEAE0"
            style={{ filter: 'drop-shadow(0 0 4px rgba(237,234,224,0.6))' }}
          />

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

        <div className={styles.centerOverlay} aria-hidden={mode === 'view'}>
          <CenterContent mode={mode} homeLabel={home.label} homeTimeLabel={homeTime.label} homeDateLabel={homeDateLabel} override={centerContent} />
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

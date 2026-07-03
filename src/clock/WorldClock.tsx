import { useId, useMemo, useRef } from 'react';
import {
  bezelTicks,
  directionChevrons,
  handAngle,
  hexToRgba,
  labelArcPath,
  LABEL_RADIUS_OFFSET,
  pointOnCircle,
  ringRadius,
  STRIKE_BOTTOM_Y,
  STRIKE_TOP_RADIUS,
  workingHoursArcPath,
} from './geometry';
import { getCityDateLabel, getCityTime, isWithinWorkingHours } from './cityTime';
import { useSweepAngle } from './useSweepAngle';
import type { RingCity, WorldClockProps } from './types';
import styles from './WorldClock.module.css';

const IN_HOURS_DOT_COLOR = '#FFFFFF';
const OUT_OF_HOURS_DOT_COLOR = '#5E626B';
const IN_HOURS_LABEL_COLOR = '#F4F3EF';
const OUT_OF_HOURS_LABEL_COLOR = '#7C808A';
const HOME_DOT_RADIUS = 5.5;
const WORLD_DOT_RADIUS = 5;
const STATUS_GOOD_THRESHOLD = 3;
const STATUS_GOOD_COLOR = '#34D399';
const STATUS_PARTIAL_COLOR = '#FBBF4B';
const STATUS_NONE_COLOR = '#565B64';

const pad = (n: number) => String(n).padStart(2, '0');

export function WorldClock({ now, homeCity, worldCities, workStart = 9, workEnd = 18 }: WorldClockProps) {
  const idPrefix = useId();

  const orderedCities: Array<RingCity & { isHome: boolean }> = useMemo(
    () => [...worldCities.map((city) => ({ ...city, isHome: false })), { ...homeCity, isHome: true }],
    [worldCities, homeCity],
  );
  const totalRings = orderedCities.length;

  const rings = useMemo(
    () =>
      orderedCities.map((city, index) => {
        const radius = ringRadius(index, totalRings);
        const labelRadius = radius + LABEL_RADIUS_OFFSET;
        const time = getCityTime(now, city.timezoneId);
        const inHours = isWithinWorkingHours(time.frac, workStart, workEnd);
        const dotPosition = pointOnCircle(labelRadius, 0);
        return {
          city,
          radius,
          time,
          inHours,
          arcPath: workingHoursArcPath(radius, time.frac, workStart, workEnd),
          topArcPath: labelArcPath(labelRadius),
          dotPosition,
          textPathId: `${idPrefix}-tp-${index}`,
        };
      }),
    [orderedCities, totalRings, now, workStart, workEnd, idPrefix],
  );

  const ticks = useMemo(() => bezelTicks(), []);
  const chevrons = useMemo(() => directionChevrons(), []);
  const arrowAngle = handAngle(now);
  const handRef = useRef<SVGGElement>(null);
  useSweepAngle(handRef);
  const glowFilterId = `${idPrefix}-glow`;

  const homeTime = getCityTime(now, homeCity.timezoneId);
  const homeDateLabel = getCityDateLabel(now, homeCity.timezoneId);

  const availableCount = rings.filter((ring) => ring.inHours).length;
  const totalCount = rings.length;
  const statusText = availableCount === 0 ? 'No teams free right now' : `${availableCount} of ${totalCount} teams free now`;
  const statusColor = availableCount === 0 ? STATUS_NONE_COLOR : availableCount >= STATUS_GOOD_THRESHOLD ? STATUS_GOOD_COLOR : STATUS_PARTIAL_COLOR;
  const statusGlow = availableCount === 0 ? 'transparent' : hexToRgba(statusColor, 0.7);
  const workLabel = `${pad(workStart)}:00–${pad(workEnd % 24)}:00`;

  const summary = rings.map((ring) => `${ring.city.name} ${ring.time.label}${ring.inHours ? ', in working hours' : ''}`).join('. ');

  return (
    <section className={styles.stage} aria-label="World clock meeting planner">
      <div className={styles.context} aria-hidden="true">
        <div className={styles.eyebrow}>MEETING&nbsp;PLANNER</div>
        <div className={styles.headline}>When can everyone meet today?</div>
      </div>

      <div className={styles.clockContainer}>
        {/* glass disc sits behind the SVG so the strike line draws on top of it, un-dimmed */}
        <div className={styles.glassDisc} aria-hidden="true" />

        <svg viewBox="0 0 1000 1000" className={styles.svg} aria-hidden="true">
          <defs>
            <filter id={glowFilterId} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
            {rings.map((ring) => (
              <path key={ring.textPathId} id={ring.textPathId} d={ring.topArcPath} fill="none" />
            ))}
          </defs>

          {rings.map((ring) => (
            <circle key={`base-${ring.city.id}`} cx={500} cy={500} r={ring.radius} fill="none" stroke="#2F323C" strokeWidth={6} />
          ))}

          <g filter={`url(#${glowFilterId})`} opacity={0.5}>
            {rings.map((ring) => (
              <path key={`glow-${ring.city.id}`} d={ring.arcPath} fill="none" stroke={ring.city.color} strokeWidth={7} strokeLinecap="round" />
            ))}
          </g>
          {rings.map((ring) => (
            <path key={`crisp-${ring.city.id}`} d={ring.arcPath} fill="none" stroke={ring.city.color} strokeWidth={6} strokeLinecap="round" />
          ))}

          <line x1={500} y1={500 - STRIKE_TOP_RADIUS} x2={500} y2={STRIKE_BOTTOM_Y} stroke="#565B64" strokeWidth={1.5} />

          {rings.map((ring) => {
            const textColor = ring.inHours ? IN_HOURS_LABEL_COLOR : OUT_OF_HOURS_LABEL_COLOR;
            return (
              <g key={`label-${ring.city.id}`}>
                <text fill={textColor} fontFamily="Space Grotesk" fontSize={23} fontWeight={400} letterSpacing="0.4" dominantBaseline="central">
                  <textPath href={`#${ring.textPathId}`} startOffset="49%" textAnchor="end">
                    {ring.city.name}
                    {' '}
                  </textPath>
                </text>
                <text fill={textColor} fontFamily="JetBrains Mono, monospace" fontSize={22} fontWeight={400} letterSpacing="0.5" dominantBaseline="central">
                  <textPath href={`#${ring.textPathId}`} startOffset="51%" textAnchor="start">
                    {' '}
                    {ring.time.label}
                  </textPath>
                </text>
              </g>
            );
          })}

          {rings.map((ring) => (
            <circle
              key={`dot-${ring.city.id}`}
              cx={ring.dotPosition.x.toFixed(2)}
              cy={ring.dotPosition.y.toFixed(2)}
              r={ring.city.isHome ? HOME_DOT_RADIUS : WORLD_DOT_RADIUS}
              fill={ring.inHours ? IN_HOURS_DOT_COLOR : OUT_OF_HOURS_DOT_COLOR}
              style={{ filter: `drop-shadow(0 0 4px ${ring.inHours ? 'rgba(255,255,255,0.55)' : 'transparent'})` }}
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
          <div className={styles.centerLocalLabel}>{homeCity.name.toUpperCase()}</div>
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
        <div className={styles.legend}>Working hours {workLabel} · local</div>
      </div>

      <p className={styles.srOnly} role="status">
        {homeCity.name} local time {homeTime.label}, {homeDateLabel}. {statusText}. {summary}.
      </p>
    </section>
  );
}

// Build-time theme. VITE_THEME=neo builds the Neo-branded clock for its own
// deployment; any other value, or none, builds the original Overlap clock.
// CSS colors live in src/index.css; this object holds what CSS cannot reach:
// the SVG clock face's colors, stroke widths and glow.
export type ThemeName = 'original' | 'neo';

export type ClockTheme = {
  inHoursDot: string;
  outOfHoursDot: string;
  inHoursDotGlow: string;
  inHoursLabel: string;
  outOfHoursLabel: string;
  meetingDot: string;
  statusGood: string;
  statusPartial: string;
  statusNone: string;
  guideLine: string;
  guideLineOpacity: number;
  ringTrack: string;
  ringTrackWidth: number;
  // undefined draws each ring in its location's own color
  ringColor: string | undefined;
  ringWidth: number;
  outOfHoursRingOpacity: number;
  ringGlowWidth: number;
  ringGlowBlur: number;
  ringGlowOpacity: number;
  // true glows only the rings whose city is in working hours now
  ringGlowOnlyInHours: boolean;
  chevron: string;
  tickMajor: string;
  tickMinor: string;
  hand: string;
  handGlow: string;
  handDotGlow: string;
  // the clock times on the rings; the center time takes its font from CSS
  timeFont: string;
  timeFontWeight: number;
  // 'hand' is the original line-and-dot sweep hand. 'orbit' is the Neo
  // Overview Hub motion (operator coreui NeoOverviewHub): a glowing arc on
  // the sweep path, and a ripple that leaves the center.
  secondsMotion: 'hand' | 'orbit';
  // the clock's default locations, for a visitor with no saved or shared config
  defaultCities: 'world' | 'neo';
  // an outlined Neo mark behind the clock, large enough to hold the clock
  backgroundMark: boolean;
  // the 60 dashes around the outside of the clock
  bezelTicks: boolean;
  // on load, the mark and the ring arcs draw themselves in
  drawIn: boolean;
};

const NEO_BLUE = '#00ACDF';
const neoBlue = (alpha: number) => `rgba(0, 172, 223, ${alpha})`;

export const CLOCK_THEMES: Record<ThemeName, ClockTheme> = {
  original: {
    inHoursDot: '#FFFFFF',
    outOfHoursDot: '#5E626B',
    inHoursDotGlow: 'rgba(255,255,255,0.55)',
    inHoursLabel: '#F4F3EF',
    outOfHoursLabel: '#7C808A',
    meetingDot: '#F472B6',
    statusGood: '#34D399',
    statusPartial: '#FBBF4B',
    statusNone: '#565B64',
    guideLine: '#9CA3AF',
    guideLineOpacity: 0.35,
    ringTrack: '#2F323C',
    ringTrackWidth: 6,
    ringColor: undefined,
    ringWidth: 6,
    outOfHoursRingOpacity: 1,
    ringGlowWidth: 7,
    ringGlowBlur: 6,
    ringGlowOpacity: 0.5,
    ringGlowOnlyInHours: false,
    chevron: '#868C97',
    tickMajor: '#6B7079',
    tickMinor: '#3D414A',
    hand: '#EDEAE0',
    handGlow: 'rgba(237,234,224,0.6)',
    handDotGlow: 'rgba(237,234,224,0.85)',
    timeFont: 'JetBrains Mono, monospace',
    timeFontWeight: 400,
    secondsMotion: 'hand',
    defaultCities: 'world',
    backgroundMark: false,
    bezelTicks: true,
    drawIn: false,
  },
  // every element is the Neo logo blue; opacity sets how strongly it reads
  neo: {
    inHoursDot: NEO_BLUE,
    outOfHoursDot: neoBlue(0.35),
    inHoursDotGlow: neoBlue(0.6),
    inHoursLabel: NEO_BLUE,
    outOfHoursLabel: neoBlue(0.5),
    meetingDot: NEO_BLUE,
    statusGood: NEO_BLUE,
    statusPartial: NEO_BLUE,
    statusNone: '#1C4E60',
    guideLine: NEO_BLUE,
    guideLineOpacity: 0.4,
    ringTrack: neoBlue(0.18),
    ringTrackWidth: 1.5,
    ringColor: NEO_BLUE,
    ringWidth: 2.5,
    outOfHoursRingOpacity: 0.55,
    ringGlowWidth: 4,
    ringGlowBlur: 3,
    ringGlowOpacity: 0.45,
    ringGlowOnlyInHours: true,
    chevron: neoBlue(0.5),
    tickMajor: neoBlue(0.55),
    tickMinor: neoBlue(0.2),
    hand: NEO_BLUE,
    handGlow: neoBlue(0.6),
    handDotGlow: neoBlue(0.85),
    timeFont: 'Public Sans, sans-serif',
    timeFontWeight: 500,
    secondsMotion: 'orbit',
    defaultCities: 'neo',
    backgroundMark: true,
    bezelTicks: false,
    drawIn: true,
  },
};

export function themeName(value: unknown): ThemeName {
  return value === 'neo' ? 'neo' : 'original';
}

export const THEME_NAME = themeName(import.meta.env.VITE_THEME);
export const CLOCK_THEME = CLOCK_THEMES[THEME_NAME];

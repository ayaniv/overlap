export type PointingHandIconProps = {
  className?: string;
  style?: React.CSSProperties;
  'data-testid'?: string;
};

// stands in for the U+1F446 emoji ScrubHint used to use as its scrub-hand
// glyph — that relied on the platform having a color-emoji font installed,
// which wall-mounted/kiosk browsers commonly don't, so it rendered blank.
export function PointingHandIcon({ className, style, 'data-testid': dataTestId }: PointingHandIconProps) {
  return (
    <svg className={className} style={style} data-testid={dataTestId} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="9.5" y="2" width="5" height="12" rx="2.5" />
      <ellipse cx="13" cy="16.5" rx="6" ry="5.3" />
      <ellipse cx="19.3" cy="15.5" rx="3" ry="2.1" transform="rotate(45 19.3 15.5)" />
    </svg>
  );
}

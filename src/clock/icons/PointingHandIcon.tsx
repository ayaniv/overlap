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
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <rect x="4" y="10" width="16" height="11" rx="6" />
    </svg>
  );
}

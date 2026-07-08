export type CloseIconProps = {
  className?: string;
};

// ControlCluster toggle's expanded (X) state, cross-faded with MenuIcon.
// strokeWidth 1.5 rather than the other icons' 2 — two crossing diagonal
// strokes read visually heavier than an open glyph at the same width,
// confirmed by rendering both side by side at 2.
export function CloseIcon({ className }: CloseIconProps) {
  return (
    <g className={className}>
      <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </g>
  );
}

export type ChromeIconProps = {
  className?: string;
  'data-testid'?: string;
};

// Simplified rendition of the Chrome logo (red/yellow/green wedges around a
// blue core), drawn inline so the site never hotlinks a brand asset.
// TODO: this is a hand-drawn approximation, not Google's official asset —
// Google's brand guidelines discourage altering the logo. Accepted as debt
// for now; revisit with the official SVG from
// https://www.google.com/chrome/brand-guidelines before wider distribution.
export function ChromeIcon({ className, 'data-testid': testId }: ChromeIconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" data-testid={testId}>
      <path fill="#EA4335" d="M4.95 13A22 22 0 0 1 43.05 13L24 24Z" />
      <path fill="#FBBC04" d="M43.05 13A22 22 0 0 1 24 46L24 24Z" />
      <path fill="#34A853" d="M24 46A22 22 0 0 1 4.95 13L24 24Z" />
      <circle cx="24" cy="24" r="10" fill="#fff" />
      <circle cx="24" cy="24" r="7.5" fill="#4285F4" />
    </svg>
  );
}

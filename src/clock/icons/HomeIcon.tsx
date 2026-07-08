export type HomeIconProps = {
  className?: string;
  'aria-label'?: string;
};

export function HomeIcon({ className, 'aria-label': ariaLabel }: HomeIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-label={ariaLabel}>
      <path d="M3 11l9-8 9 8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v10h14V10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

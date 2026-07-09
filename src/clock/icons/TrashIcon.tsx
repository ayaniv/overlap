export type TrashIconProps = {
  // lifts the lid open around its hinge (the bin's back-left corner) — used
  // while a remove request is actually in flight, so the busy state reads
  // at a glance instead of relying on aria-label/disabled alone
  isOpen?: boolean;
};

export function TrashIcon({ isOpen = false }: TrashIconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <g transform={isOpen ? 'rotate(-28 4 7)' : undefined} style={{ transition: 'transform 0.15s ease' }}>
        <path d="M4 7h16" strokeLinecap="round" />
        <path d="M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path d="M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6" strokeLinecap="round" />
      <path d="M14 11v6" strokeLinecap="round" />
    </svg>
  );
}

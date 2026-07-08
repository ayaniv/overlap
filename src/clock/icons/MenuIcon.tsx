export type MenuIconProps = {
  className?: string;
};

// two horizontal lines (the "hamburger" state of ControlCluster's toggle);
// cross-fades with CloseIcon rather than morphing into it — see the CSS
// comment on .hamburgerIcon/.closeIcon in ControlCluster.module.css
export function MenuIcon({ className }: MenuIconProps) {
  return (
    <g className={className}>
      <line x1="4" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <line x1="4" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </g>
  );
}

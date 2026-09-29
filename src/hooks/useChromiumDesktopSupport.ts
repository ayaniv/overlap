import { useLayoutEffect, useState } from 'react';
import { isChromiumDesktop } from '../clock/chromeExtension';

export type ChromiumDesktopSupport = 'unknown' | 'supported' | 'unsupported';

// window (not navigator) is the right guard: it's what's actually absent
// during real server rendering, where useLayoutEffect is a no-op and React
// logs a dev warning about it. navigator.userAgentData / navigator.userAgent
// are what isChromiumDesktop() itself needs and already guards separately.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? () => {} : useLayoutEffect;

// a single hook call (in App, shared by both the hero and header CTAs) so
// the userAgentData/UA check only runs once, and so both placements resolve
// off the exact same value rather than two independently-timed effects.
//
// useLayoutEffect, not useEffect, is what actually prevents a visible
// reflow: for the initial mount, React fires layout effects synchronously
// as part of the very same commit that produces the page's first paint, so
// a real browser never gets a chance to paint the 'unknown' state at all —
// there's no separate frame where the CTA is still missing. A passive
// effect (useEffect) is deferred until after that first paint, so resolving
// there would reflow the page a moment later (see useChromiumDesktopSupport.test.tsx).
export function useChromiumDesktopSupport(): ChromiumDesktopSupport {
  const [support, setSupport] = useState<ChromiumDesktopSupport>('unknown');

  useIsomorphicLayoutEffect(() => {
    setSupport(isChromiumDesktop() ? 'supported' : 'unsupported');
  }, []);

  return support;
}

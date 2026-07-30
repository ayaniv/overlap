// plain function, not a hook — the OS/device a page is running on can't change mid-session,
// so there's nothing to subscribe to (unlike useIsPortrait's live orientation query)
export function isMobileOS(): boolean {
  const userAgent = navigator.userAgent;
  if (/android|iphone|ipod|ipad/i.test(userAgent)) return true;
  // iPadOS 13+ requests desktop sites by default, so an iPad's userAgent reports as a Mac —
  // multi-touch is the giveaway a "MacIntel" is actually an iPad (a real Mac reports 0 or 1)
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

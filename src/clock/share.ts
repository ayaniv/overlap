// copies the current share link (location.href, already carrying `#c=`) to the
// clipboard; the clipboard is passed in explicitly so callers (and tests) don't
// depend on a global navigator.clipboard being present
export async function copyShareLink(clipboard: Pick<Clipboard, 'writeText'>, href: string): Promise<boolean> {
  try {
    await clipboard.writeText(href);
    return true;
  } catch (err) {
    console.error('overlap: failed to copy share link', err);
    return false;
  }
}

type ShareData = { url?: string; title?: string };
type ShareCapableNavigator = { share?: (data: ShareData) => Promise<void> };

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'name' in err && (err as { name: unknown }).name === 'AbortError';
}

// prefers the native OS share sheet (navigator.share) when the browser
// supports it, falling back to a clipboard copy otherwise or if the native
// share itself fails for a reason other than the user dismissing the sheet
export async function shareLink(
  nav: ShareCapableNavigator,
  clipboard: Pick<Clipboard, 'writeText'>,
  href: string,
): Promise<ShareOutcome> {
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ url: href });
      return 'shared';
    } catch (err) {
      if (isAbortError(err)) return 'cancelled';
      console.error('overlap: navigator.share failed, falling back to clipboard copy', err);
    }
  }

  const didCopy = await copyShareLink(clipboard, href);
  return didCopy ? 'copied' : 'failed';
}

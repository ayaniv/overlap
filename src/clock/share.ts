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

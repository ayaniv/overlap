import { describe, expect, it } from 'vitest';
import { applyThemeToHtml } from './theme.ts';

const HTML = '<!doctype html>\n<html lang="en">\n  <head>\n    <title>Overlap</title>\n  </head>\n</html>';

describe('applyThemeToHtml', () => {
  it('leaves the original build unchanged', () => {
    expect(applyThemeToHtml(HTML, undefined)).toBe(HTML);
    expect(applyThemeToHtml(HTML, 'original')).toBe(HTML);
  });

  it('marks the Neo build and keeps it out of search results', () => {
    const html = applyThemeToHtml(HTML, 'neo');
    expect(html).toContain('<html data-theme="neo" lang="en">');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />\n  </head>');
  });
});

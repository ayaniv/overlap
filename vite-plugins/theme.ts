import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

// Public Sans is the Neo brand font; only the Neo build loads it
export const NEO_FONT_LINK =
  '<link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />';

export const NEO_ROBOTS_TXT = 'User-agent: *\nDisallow: /\n';

// The Neo build is a second deployment of the same clock. It sets
// data-theme="neo" on <html> before any CSS or script runs, so the page never
// shows the original colors first, and it opts out of search results so it
// does not compete with overlapclock.com.
export function applyThemeToHtml(html: string, theme: string | undefined): string {
  if (theme !== 'neo') return html;
  return html
    .replace(/<html(\s|>)/, '<html data-theme="neo"$1')
    .replace('</head>', `    <meta name="robots" content="noindex, nofollow" />\n    ${NEO_FONT_LINK}\n  </head>`);
}

export function theme(): Plugin {
  let themeName: string | undefined;
  let outDir = 'dist';
  return {
    name: 'overlap:theme',
    configResolved(config) {
      themeName = config.env.VITE_THEME;
      outDir = config.build.outDir;
    },
    transformIndexHtml(html) {
      return applyThemeToHtml(html, themeName);
    },
    // public/robots.txt invites crawlers; the Neo build replaces it after
    // Vite copies public/, so the static pages are not indexed either
    closeBundle() {
      if (themeName === 'neo') writeFileSync(join(outDir, 'robots.txt'), NEO_ROBOTS_TXT);
    },
  };
}

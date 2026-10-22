import { existsSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import type { Connect, Plugin } from 'vite';

// Vercel serves public/<name>.html at /<name> (vercel.json "cleanUrls"), but
// Vite's dev/preview servers don't read vercel.json, so without this /privacy
// falls through to the SPA's index.html locally and every footer link to a
// static page silently reopens the clock instead.
export function rewriteCleanUrl(publicDir: string, url: string): string | null {
  const suffixStart = url.search(/[?#]/);
  const pathname = suffixStart === -1 ? url : url.slice(0, suffixStart);
  const suffix = suffixStart === -1 ? '' : url.slice(suffixStart);
  if (pathname === '/' || extname(pathname) !== '') return null;

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    // not a valid page path; let Vite answer it the way it answers any bad URL
    return null;
  }

  const root = resolve(publicDir);
  const file = resolve(root, `.${decodedPath}.html`);
  if (!file.startsWith(root + sep) || !existsSync(file)) return null;
  return `${pathname}.html${suffix}`;
}

function cleanUrlsMiddleware(publicDir: string): Connect.NextHandleFunction {
  return (req, _res, next) => {
    const rewritten = req.url ? rewriteCleanUrl(publicDir, req.url) : null;
    if (rewritten) req.url = rewritten;
    next();
  };
}

export function cleanUrls(): Plugin {
  return {
    name: 'overlap:clean-urls',
    configureServer(server) {
      server.middlewares.use(cleanUrlsMiddleware(server.config.publicDir));
    },
    // vite preview serves the build output, where public/ has been copied verbatim
    configurePreviewServer(server) {
      server.middlewares.use(cleanUrlsMiddleware(resolve(server.config.root, server.config.build.outDir)));
    },
  };
}

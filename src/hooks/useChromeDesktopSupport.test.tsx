import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChromeDesktopSupport } from './useChromeDesktopSupport';

const CHROME_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const FIREFOX_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0';

function stubUserAgent(userAgent: string) {
  vi.stubGlobal('navigator', { userAgent, platform: 'MacIntel', maxTouchPoints: 0 });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useChromeDesktopSupport', () => {
  it('resolves to "supported" on desktop Chrome and "unsupported" elsewhere', () => {
    stubUserAgent(CHROME_DESKTOP_UA);
    const { result: chromeResult } = renderHook(() => useChromeDesktopSupport());
    expect(chromeResult.current).toBe('supported');

    stubUserAgent(FIREFOX_DESKTOP_UA);
    const { result: firefoxResult } = renderHook(() => useChromeDesktopSupport());
    expect(firefoxResult.current).toBe('unsupported');
  });

  it('resolves via a layout effect, synchronously within the initial mount, so a real browser never paints "unknown" — proven here by inspecting the result immediately after a flushSync render, which forces layout effects but deliberately leaves passive effects (useEffect) unflushed', () => {
    stubUserAgent(CHROME_DESKTOP_UA);
    let observedSupport: string | undefined;
    function Probe() {
      observedSupport = useChromeDesktopSupport();
      return null;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    // a regression back to useEffect would leave observedSupport 'unknown'
    // here, since flushSync doesn't force passive effects to run
    flushSync(() => root.render(<Probe />));

    expect(observedSupport).toBe('supported');

    root.unmount();
    container.remove();
  });
});

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSweepAngle } from './useSweepAngle';

function stubMatchMedia(reducedMotion: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? reducedMotion : false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

// Stubbed ourselves (rather than relying on vitest's fake-timer frame clock, which advances
// real time by ~16ms on every simulated frame) so a test can flush exactly one frame at a
// precisely-controlled system time — including the exact instant of a minute boundary.
function stubRAF() {
  let nextId = 1;
  const queued = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
    const id = nextId++;
    queued.set(id, cb);
    return id;
  }) as typeof requestAnimationFrame);
  vi.stubGlobal('cancelAnimationFrame', ((id: number) => {
    queued.delete(id);
  }) as typeof cancelAnimationFrame);
  return {
    flushOneFrame: () => {
      const entries = Array.from(queued.entries());
      queued.clear();
      entries.forEach(([, cb]) => cb(0));
    },
    pendingCount: () => queued.size,
  };
}

function createRef() {
  return { current: document.createElementNS('http://www.w3.org/2000/svg', 'g') };
}

beforeEach(() => {
  stubMatchMedia(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useSweepAngle', () => {
  it('lands exactly at the top (0deg) on the minute boundary', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const raf = stubRAF();
    const ref = createRef();
    renderHook(() => useSweepAngle(ref));

    raf.flushOneFrame();

    expect(ref.current.getAttribute('transform')).toBe('rotate(0.000 500 500)');
  });

  // regression: the sweep hand's DOM transform must be owned exclusively by this hook's
  // rAF loop. It previously raced against WorldClock's own `transform={...}` JSX prop
  // (bound to the once-a-second `now` state) — every re-render of that prop clobbered
  // whatever frame-accurate angle the rAF loop had just written, producing a once-a-second
  // stutter that was most visible right at the 12 o'clock mark, since that's the only point
  // on the dial with a fixed reference (the triangle marker) to expose the misalignment
  // against. A React re-render elsewhere in the tree (simulated here by re-rendering the
  // hook with a fresh ref object, the only prop it takes) must never alter an angle this
  // hook already wrote between frames.
  it('is not clobbered by an unrelated React re-render between animation frames', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:10.000Z')); // 10s in -> 60deg
    const raf = stubRAF();
    const ref = createRef();
    const { rerender } = renderHook((r: ReturnType<typeof createRef>) => useSweepAngle(r), { initialProps: ref });

    raf.flushOneFrame();
    const afterFirstFrame = ref.current.getAttribute('transform');
    expect(afterFirstFrame).toBe('rotate(60.000 500 500)');

    // re-render without flushing a new frame — the DOM attribute must be untouched by the
    // render itself; only a fresh rAF flush is allowed to change it
    rerender(ref);
    expect(ref.current.getAttribute('transform')).toBe(afterFirstFrame);
  });

  it('keeps sweeping forward through the minute rollover instead of jumping backward', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const t0 = new Date('2026-01-01T00:00:59.900Z'); // 100ms before the top
    vi.setSystemTime(t0);
    const raf = stubRAF();
    const ref = createRef();
    renderHook(() => useSweepAngle(ref));

    raf.flushOneFrame();
    expect(ref.current.getAttribute('transform')).toBe('rotate(359.400 500 500)');

    vi.setSystemTime(new Date(t0.getTime() + 200)); // crosses the minute boundary
    raf.flushOneFrame();
    expect(ref.current.getAttribute('transform')).toBe('rotate(0.600 500 500)');
  });

  it('under prefers-reduced-motion, ticks once a second instead of animating continuously', () => {
    stubMatchMedia(true);
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const ref = createRef();
    renderHook(() => useSweepAngle(ref));

    expect(ref.current.getAttribute('transform')).toBe('rotate(0.000 500 500)');

    vi.advanceTimersByTime(1000);
    expect(ref.current.getAttribute('transform')).toBe('rotate(6.000 500 500)');
  });

  it('stops updating once unmounted', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const raf = stubRAF();
    const ref = createRef();
    const { unmount } = renderHook(() => useSweepAngle(ref));

    raf.flushOneFrame();
    const atFirstFrame = ref.current.getAttribute('transform');
    unmount();
    expect(raf.pendingCount()).toBe(0); // the next-scheduled frame was cancelled on cleanup

    vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'));
    raf.flushOneFrame(); // nothing queued, so this is a no-op
    expect(ref.current.getAttribute('transform')).toBe(atFirstFrame);
  });
});

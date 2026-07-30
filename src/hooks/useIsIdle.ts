import { useEffect, useState } from 'react';

export const DEFAULT_IDLE_TIMEOUT_MS = 8000;

// pointermove covers both mouse movement and hover; pointerdown covers clicks
// and taps; touchstart is kept alongside pointerdown for older/non-unified
// touch handling; keydown covers keystrokes
const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'touchstart'] as const;

// drives an ambient "wall display" mode: after `timeoutMs` of no user activity,
// the caller can fade out interactive chrome so the clock reads as a clean
// ambient display instead of an app waiting for input; any activity (a touch,
// a keystroke, moving/hovering the pointer) immediately clears it again.
export function useIsIdle(timeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS): boolean {
  const [isIdle, setIsIdle] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const scheduleIdle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setIsIdle(true), timeoutMs);
    };

    const handleActivity = () => {
      setIsIdle(false);
      scheduleIdle();
    };

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity);
    }
    scheduleIdle();

    return () => {
      clearTimeout(timer);
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity);
      }
    };
  }, [timeoutMs]);

  return isIdle;
}

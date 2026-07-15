import { useEffect, useState } from 'react';

// pointerdown/pointermove/touchstart only — deliberately excludes keydown.
// keydown is how useRingScrub's own arrow-key scrub works (bound directly on
// the clock's slider element), so counting it here would flip this hook true
// from the exact same keystroke that IS the user successfully discovering the
// scrub gesture on their own — right in the middle of it. Pointer/touch
// activity anywhere else on the page is a safe, unrelated "someone's here"
// signal that can't itself be mistaken for operating the ring.
const PRESENCE_EVENTS = ['pointermove', 'pointerdown', 'touchstart'] as const;

// one-shot latch: false until the first real pointer/touch activity anywhere
// on the page, then permanently true — keeps onboarding UI off an
// ambient/kiosk display that's never actually touched, even briefly on page
// load (unlike useIsIdle, which starts "not idle" and only reacts after a
// timeout with no activity yet).
export function useHasBeenActive(): boolean {
  const [hasBeenActive, setHasBeenActive] = useState(false);

  useEffect(() => {
    if (hasBeenActive) return;

    const handleActivity = () => setHasBeenActive(true);
    for (const eventName of PRESENCE_EVENTS) {
      window.addEventListener(eventName, handleActivity);
    }
    return () => {
      for (const eventName of PRESENCE_EVENTS) {
        window.removeEventListener(eventName, handleActivity);
      }
    };
  }, [hasBeenActive]);

  return hasBeenActive;
}

import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_DURATION_MS = 2600;

// transient status message (e.g. "Link copied") that auto-hides after
// durationMs; a repeat call restarts the timer instead of stacking messages
export function useToast(durationMs = DEFAULT_DURATION_MS) {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const showToast = useCallback(
    (text: string) => {
      clearTimeout(timeoutRef.current);
      setMessage(text);
      timeoutRef.current = setTimeout(() => setMessage(null), durationMs);
    },
    [durationMs],
  );

  return { message, showToast };
}

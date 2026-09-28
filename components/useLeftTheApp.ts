// The only honest signal we have that somebody went and did the thing.
//
// Nobody can verify a follow, a like or a review — no platform exposes it. What
// we CAN see is that the app went to the background after we sent them somewhere,
// and came back a few seconds later. That will not catch someone determined to
// cheat, and it is not meant to. It is there so that a tap on a dead link, a
// cancelled sheet, or a mis-fire never quietly hands out a free drink.
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/** Long enough that flicking out and straight back does not count. */
export const MIN_AWAY_MS = 6000;

export function useLeftTheApp(onReturn: (awayMs: number) => void) {
  const leftAt = useRef<number | null>(null);
  const armed = useRef(false);
  const cb = useRef(onReturn);
  cb.current = onReturn;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (!armed.current) return;
      if (state === 'background' || state === 'inactive') {
        if (leftAt.current === null) leftAt.current = Date.now();
      } else if (state === 'active' && leftAt.current !== null) {
        const away = Date.now() - leftAt.current;
        leftAt.current = null;
        armed.current = false;
        cb.current(away);
      }
    });
    return () => sub.remove();
  }, []);

  /** Call this immediately before sending them off somewhere. */
  const arm = useCallback(() => { armed.current = true; leftAt.current = null; }, []);
  const disarm = useCallback(() => { armed.current = false; leftAt.current = null; }, []);

  return { arm, disarm };
}

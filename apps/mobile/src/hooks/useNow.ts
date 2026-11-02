import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

function isForeground(status: AppStateStatus | null | undefined): boolean {
  return status !== 'background' && status !== 'inactive';
}

/**
 * The current time (ms), re-read every `intervalMs` while the screen is mounted and the app is in
 * the foreground. Countdown labels computed from `Date.now()` during render only move when
 * something else re-renders the screen — a poll that returns the same data doesn't — so they need
 * a clock of their own. In the background the clock stops, and it catches up on return.
 */
export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      setNow(Date.now());
      timer = setInterval(() => setNow(Date.now()), intervalMs);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    if (isForeground(AppState.currentState)) start();
    const subscription = AppState.addEventListener('change', (status) => {
      if (isForeground(status)) start();
      else stop();
    });
    return () => {
      stop();
      subscription.remove();
    };
  }, [intervalMs]);

  return now;
}

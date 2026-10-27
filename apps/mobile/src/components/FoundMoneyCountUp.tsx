import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Text, type TextStyle } from 'react-native';

import { formatMinor } from '@/src/lib/format';
import {
  FOUND_MONEY_COUNTUP_MS,
  countUpMinor,
  markFoundMoneyCountUpRun,
  shouldAnimateFoundMoneyCountUp,
} from '@/src/lib/foundMoneyCountUp';
import { vaultTotalA11yLabel } from '@/src/lib/vaultA11y';

type Props = {
  totalMinor: number;
  currency?: string;
  style?: TextStyle;
};

/**
 * W012 — Animates found-money total once per session; skips under Reduce Motion.
 * Uses rAF (not native Animated) so Reduce Motion + vitest stay deterministic.
 */
export function FoundMoneyCountUp({ totalMinor, currency = 'INR', style }: Props) {
  const [displayMinor, setDisplayMinor] = useState(totalMinor);
  /** null = AccessibilityInfo not resolved yet — do not start a count-up. */
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const startedFor = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (alive) setReduceMotion(Boolean(enabled));
    });
    const sub = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (enabled: boolean) => setReduceMotion(Boolean(enabled)),
    );
    return () => {
      alive = false;
      // RN typings vary across versions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sub as any)?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) {
      setDisplayMinor(totalMinor);
      return;
    }
    if (
      !shouldAnimateFoundMoneyCountUp({
        totalMinor,
        reduceMotion,
      })
    ) {
      setDisplayMinor(totalMinor);
      return;
    }
    if (startedFor.current === totalMinor) {
      setDisplayMinor(totalMinor);
      return;
    }
    startedFor.current = totalMinor;
    markFoundMoneyCountUpRun();

    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / FOUND_MONEY_COUNTUP_MS);
      setDisplayMinor(countUpMinor(0, totalMinor, t));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplayMinor(totalMinor);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [totalMinor, reduceMotion]);

  return (
    <Text
      style={style}
      accessibilityRole="text"
      accessibilityLabel={vaultTotalA11yLabel(totalMinor, currency)}
      testID="found-money-countup"
    >
      {formatMinor(displayMinor, currency)}
    </Text>
  );
}

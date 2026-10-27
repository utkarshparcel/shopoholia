import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  AVATAR_REVEAL_MS,
  shouldAnimateAvatarReveal,
} from '@/src/lib/todayWow';
import {
  closet,
  fontSans,
  fsBody,
  fsCaption,
  radiusMd,
  space4,
} from '@/src/theme/tokens';

type Props = {
  visible: boolean;
  occasion?: string | null;
  onDone: () => void;
};

/**
 * W043 — short morning outfit reveal when opening worn://today.
 * Skips motion under Reduce Motion (instant flash then dismiss).
 */
export function AvatarOutfitReveal({ visible, occasion, onDone }: Props) {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [opacity, setOpacity] = useState(0);

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sub as any)?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (!visible || reduceMotion === null) return;
    let cancelled = false;

    if (!shouldAnimateAvatarReveal(reduceMotion)) {
      setOpacity(1);
      const t = setTimeout(() => {
        if (cancelled) return;
        setOpacity(0);
        onDone();
      }, 120);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }

    const start = Date.now();
    let raf = 0;
    const tick = () => {
      if (cancelled) return;
      const elapsed = Date.now() - start;
      const half = AVATAR_REVEAL_MS / 2;
      if (elapsed < half) {
        setOpacity(Math.min(1, elapsed / half));
      } else {
        setOpacity(Math.max(0, 1 - (elapsed - half) / half));
      }
      if (elapsed < AVATAR_REVEAL_MS) {
        raf = requestAnimationFrame(tick);
      } else {
        setOpacity(0);
        onDone();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // Intentionally omit onDone — parent passes inline setter
  }, [visible, reduceMotion]);

  if (!visible) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.overlay, { opacity }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="avatar-outfit-reveal"
    >
      <View style={styles.card}>
        <Text style={styles.kicker}>Your look today</Text>
        <Text style={styles.title}>{(occasion ?? 'CASUAL').replace(/_/g, ' ')}</Text>
        <Text style={styles.muted}>From your closet — not a fantasy try-on.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: closet.surface,
    borderColor: closet.accent,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: 6,
    marginHorizontal: space4,
    padding: space4,
  },
  kicker: {
    color: closet.accent,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  muted: {
    color: closet.muted,
    fontFamily: fontSans,
    fontSize: fsCaption,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: 'rgba(20, 16, 12, 0.35)',
    justifyContent: 'center',
    zIndex: 20,
  },
  title: {
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
});

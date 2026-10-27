/**
 * W072 — rewear streak card with milestone celebration (Reduce Motion safe).
 */

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { buildRewearCelebrate } from '@/src/lib/rewearCelebrate';
import { delightHapticWoreIt } from '@/src/lib/delightHaptics';
import { rewearStreakNudgeCopy, type RewearStreak } from '@/src/lib/rewearStreak';
import { trackEvent } from '@/src/lib/analytics';
import {
  border,
  closet,
  fontSans,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  radiusMd,
  space3,
  space4,
  text,
  textMuted,
} from '@/src/theme/tokens';

type Props = {
  streak: RewearStreak;
};

export function RewearStreakCelebrate({ streak }: Props) {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const celebratedFor = useRef<number | null>(null);

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

  const model =
    reduceMotion === null
      ? buildRewearCelebrate(streak.currentStreak, true)
      : buildRewearCelebrate(streak.currentStreak, reduceMotion);

  useEffect(() => {
    if (reduceMotion === null) return;
    if (!model.celebrate) return;
    if (celebratedFor.current === streak.currentStreak) return;
    celebratedFor.current = streak.currentStreak;
    trackEvent('rewear_streak_milestone', { streak: streak.currentStreak });
    if (model.animate) {
      void delightHapticWoreIt();
    }
  }, [model.animate, model.celebrate, reduceMotion, streak.currentStreak]);

  useEffect(() => {
    trackEvent('rewear_streak_viewed', { streak: streak.currentStreak });
  }, [streak.currentStreak]);

  return (
    <View
      style={[styles.card, model.celebrate ? styles.celebrateCard : null]}
      testID="rewear-streak-celebrate"
      accessibilityRole="summary"
    >
      <Text style={styles.title}>{streak.label}</Text>
      <Text style={styles.muted}>{rewearStreakNudgeCopy(streak)}</Text>
      {streak.longestStreak > streak.currentStreak ? (
        <Text style={styles.muted}>Best: {streak.longestStreak} days</Text>
      ) : null}
      {model.celebrate ? (
        <View
          style={[styles.banner, model.animate ? styles.bannerPulse : null]}
          accessibilityRole="alert"
          testID="rewear-streak-milestone"
        >
          <Text style={styles.bannerText}>{model.copy}</Text>
          {reduceMotion ? (
            <Text style={styles.muted}>Reduce Motion — celebration is static.</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: closet.accentBg,
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: space3,
    marginBottom: space4,
    padding: space4,
  },
  celebrateCard: {
    borderColor: closet.found,
  },
  title: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  muted: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption },
  banner: {
    backgroundColor: closet.mist,
    borderRadius: radiusMd,
    gap: 4,
    padding: space3,
  },
  bannerPulse: {
    borderColor: closet.found,
    borderWidth: 1,
  },
  bannerText: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsCaption,
  },
});

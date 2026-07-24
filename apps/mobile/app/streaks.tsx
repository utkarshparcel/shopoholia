import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { claimStreak, getStreak } from '@/src/api/client';
import { Button } from '@/src/components/ui';
import { useSessionStore } from '@/src/stores/session';
import {
  accent,
  accentBg,
  bg,
  fontDisplay,
  fontMono,
  fontSansMedium,
  fsBody,
  fsCaption,
  fsDisplayL,
  fsDisplayM,
  radiusLg,
  space2,
  space3,
  space4,
  space6,
  surface,
  text,
  textMuted,
  wornInk,
} from '@/src/theme/tokens';

const STREAK_MILESTONES = [
  { day: 1, coins: 10 },
  { day: 3, coins: 25 },
  { day: 7, coins: 50 },
  { day: 14, coins: 75 },
  { day: 30, coins: 100 },
];

export default function StreaksScreen() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [todayClaimed, setTodayClaimed] = useState(false);
  const [nextCoins, setNextCoins] = useState(10);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    getStreak(accessToken)
      .then((data) => {
        if (cancelled) return;
        setStreak(data.currentStreak);
        setTodayClaimed(data.todayClaimed);
        setNextCoins(data.nextRewardCoins);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load streak');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (loading) {
    return (
      <View style={[styles.center, styles.screen, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={wornInk} />
      </View>
    );
  }

  const handleClaim = async () => {
    if (!accessToken || todayClaimed || claiming) return;
    setClaiming(true);
    setClaimError(null);
    try {
      const res = await claimStreak(accessToken);
      setStreak(res.currentStreak);
      setBalance(res.balanceAfter);
      setTodayClaimed(true);
      setNextCoins(10);
    } catch (e: unknown) {
      setClaimError(e instanceof Error ? e.message : 'Failed to claim reward');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{
        paddingBottom: insets.bottom + space6,
        paddingTop: insets.top + space4,
      }}
      style={styles.screen}
    >
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      {error ? (
        <View style={styles.errorState}>
          <Text style={styles.errorTitle}>Could not load streak</Text>
          <Text style={styles.errorBody}>{error}</Text>
        </View>
      ) : (
        <>
          <View style={styles.hero}>
            <Text style={styles.streakGlyph}>◆</Text>
            <Text style={styles.heroStreak}>
              {streak} day{streak === 1 ? '' : 's'}
            </Text>
            <Text style={styles.heroSubtitle}>Current streak</Text>
          </View>

          <View style={styles.claimCard}>
            <Text style={styles.claimTitle}>
              {todayClaimed ? 'Come back tomorrow!' : `Claim ${nextCoins} coins`}
            </Text>
            <Text style={styles.claimSubtitle}>
              {todayClaimed
                ? "You've claimed today's streak reward"
                : 'Tap below to claim your daily reward'}
            </Text>
            <Button
              label={todayClaimed ? 'Claimed ✓' : claiming ? 'Claiming…' : 'Claim coins'}
              onPress={handleClaim}
              disabled={todayClaimed || claiming}
              variant="primary"
              size="lg"
              style={styles.claimBtn}
            />
            {claimError ? <Text style={styles.claimError}>{claimError}</Text> : null}
            {balance > 0 ? (
              <Text style={styles.balanceText}>Balance: {balance} coins</Text>
            ) : null}
          </View>

          <View style={styles.milestonesSection}>
            <Text style={styles.sectionTitle}>Reward milestones</Text>
            {STREAK_MILESTONES.map((m) => {
              const unlocked = streak >= m.day;
              return (
                <View key={m.day} style={[styles.milestoneRow, unlocked && styles.milestoneUnlocked]}>
                  <Text style={[styles.milestoneDay, unlocked && styles.milestoneDayUnlocked]}>
                    Day {m.day}
                  </Text>
                  <Text style={[styles.milestoneCoins, unlocked && styles.milestoneCoinsUnlocked]}>
                    {m.coins} coins
                  </Text>
                  <Text style={styles.milestoneStatus}>
                    {unlocked ? '✓' : streak + 1 === m.day ? 'Next' : ''}
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: {
    marginBottom: space4,
    paddingHorizontal: space4,
  },
  backText: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
  },
  balanceText: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
    marginTop: space2,
    textAlign: 'center',
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  claimBtn: {
    marginTop: space4,
  },
  claimCard: {
    alignItems: 'center',
    backgroundColor: surface,
    borderRadius: radiusLg,
    marginBottom: space4,
    marginHorizontal: space4,
    padding: space6,
  },
  claimError: {
    color: '#9a4d3a',
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
    marginTop: space2,
    textAlign: 'center',
  },
  claimSubtitle: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
    marginTop: space2,
    textAlign: 'center',
  },
  claimTitle: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayM,
  },
  errorBody: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
    marginTop: space2,
    textAlign: 'center',
  },
  errorState: {
    alignItems: 'center',
    backgroundColor: surface,
    borderRadius: radiusLg,
    marginHorizontal: space4,
    padding: space6,
  },
  errorTitle: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayM,
  },
  hero: {
    alignItems: 'center',
    padding: space6,
  },
  heroStreak: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayL,
    marginTop: space2,
  },
  heroSubtitle: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
  },
  milestoneCoins: {
    color: textMuted,
    flex: 1,
    fontFamily: fontMono,
    fontSize: fsBody,
  },
  milestoneCoinsUnlocked: {
    color: accent,
  },
  milestoneDay: {
    color: text,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
    width: 80,
  },
  milestoneDayUnlocked: {
    color: accent,
  },
  milestoneRow: {
    alignItems: 'center',
    backgroundColor: surface,
    borderRadius: 12,
    flexDirection: 'row',
    marginBottom: space2,
    padding: space3,
    paddingHorizontal: space4,
  },
  milestoneStatus: {
    color: accent,
    fontFamily: fontMono,
    fontSize: fsCaption,
    textAlign: 'right',
    width: 40,
  },
  milestoneUnlocked: {
    backgroundColor: accentBg,
  },
  milestonesSection: {
    marginBottom: space4,
    marginHorizontal: space4,
  },
  screen: {
    backgroundColor: bg,
    flex: 1,
  },
  sectionTitle: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayM,
    marginBottom: space3,
  },
  streakGlyph: {
    color: accent,
    fontFamily: fontMono,
    fontSize: 32,
  },
});

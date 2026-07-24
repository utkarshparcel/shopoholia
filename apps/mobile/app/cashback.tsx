import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCashback } from '@/src/api/client';
import { useSessionStore } from '@/src/stores/session';
import {
  accent,
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
  wornPaper,
  wornWarm,
} from '@/src/theme/tokens';

const PLATFORM_COLORS: Record<string, string> = {
  flipkart: '#2874F0',
  amazon: '#FF9900',
  myntra: '#E91E63',
  ajio: '#2E2E2E',
  nykaa: '#FC2779',
};

type CashbackEvent = {
  id: string;
  listingId: string | null;
  platform: string;
  coinsEarned: number;
  status: string;
  createdAt: string;
};

export default function CashbackScreen() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<CashbackEvent[]>([]);
  const [totalEarned, setTotalEarned] = useState(0);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    getCashback(accessToken)
      .then((data) => {
        if (cancelled) return;
        setEvents(data.events);
        setTotalEarned(data.totalEarned);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load cashback');
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

      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Cashback rewards</Text>
        <Text style={styles.heroSubtitle}>Earn coins when you buy via affiliate links</Text>
      </View>

      {error ? (
        <View style={styles.errorState}>
          <Text style={styles.errorTitle}>Could not load cashback</Text>
          <Text style={styles.errorBody}>{error}</Text>
        </View>
      ) : (
        <>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>TOTAL EARNED</Text>
            <Text style={styles.totalValue}>{totalEarned} coins</Text>
          </View>

          <View style={styles.eventsSection}>
            <Text style={styles.sectionTitle}>Your cashback history</Text>
            {events.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Text style={styles.emptyIconText}>◎</Text>
                </View>
                <Text style={styles.emptyTitle}>No cashback yet</Text>
                <Text style={styles.emptyBody}>
                  Tap "Buy for real" on any listing to earn coins on your purchase
                </Text>
              </View>
            ) : (
              events.map((event) => (
                <View key={event.id} style={styles.eventRow}>
                  <View
                    style={[
                      styles.platformBadge,
                      { backgroundColor: PLATFORM_COLORS[event.platform] ?? '#666' },
                    ]}
                  >
                    <Text style={styles.platformText}>{event.platform.toUpperCase()}</Text>
                  </View>
                  <View style={styles.eventMeta}>
                    <Text style={styles.eventStatus}>
                      {event.status === 'CONFIRMED'
                        ? `+${event.coinsEarned} coins`
                        : event.status === 'PENDING'
                          ? 'Pending'
                          : 'Rejected'}
                    </Text>
                    <Text style={styles.eventDate}>
                      {new Date(event.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
              ))
            )}
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
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  emptyBody: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
    marginTop: space2,
    textAlign: 'center',
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: wornWarm,
    borderRadius: 40,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  emptyIconText: {
    color: textMuted,
    fontSize: 28,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: surface,
    borderRadius: radiusLg,
    padding: space6,
  },
  emptyTitle: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayM,
    marginTop: space3,
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
  eventDate: {
    color: textMuted,
    fontFamily: fontMono,
    fontSize: fsCaption,
  },
  eventMeta: {
    alignItems: 'flex-end',
    flex: 1,
  },
  eventRow: {
    alignItems: 'center',
    backgroundColor: surface,
    borderRadius: 12,
    flexDirection: 'row',
    marginBottom: space2,
    padding: space3,
    paddingHorizontal: space4,
  },
  eventStatus: {
    color: text,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
  },
  eventsSection: {
    marginBottom: space4,
    marginHorizontal: space4,
  },
  hero: {
    alignItems: 'center',
    padding: space6,
  },
  heroSubtitle: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
    marginTop: space2,
    textAlign: 'center',
  },
  heroTitle: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayL,
  },
  platformBadge: {
    borderRadius: 6,
    paddingHorizontal: space2,
    paddingVertical: space2,
  },
  platformText: {
    color: '#fff',
    fontFamily: fontMono,
    fontSize: fsCaption,
    fontWeight: '700',
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
  totalCard: {
    alignItems: 'center',
    backgroundColor: wornInk,
    borderRadius: radiusLg,
    marginBottom: space4,
    marginHorizontal: space4,
    padding: space6,
  },
  totalLabel: {
    color: wornPaper,
    fontFamily: fontMono,
    fontSize: fsCaption,
    letterSpacing: 2,
    opacity: 0.7,
  },
  totalValue: {
    color: wornPaper,
    fontFamily: fontDisplay,
    fontSize: fsDisplayL,
    marginTop: space2,
  },
});

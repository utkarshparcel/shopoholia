import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, OrderTracker, SectionHeader } from '@/src/components/ui';
import { useOrder } from '@/src/hooks/orders';
import { trackEvent } from '@/src/lib/analytics';
import { buildTrackerSteps, nextEtaLabel } from '@/src/lib/order-tracking';
import {
  bg,
  fontSansMedium,
  fsBody,
  space4,
  space6,
  textMuted,
  wornInk,
} from '@/src/theme/tokens';

export default function OrderTrackingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderQuery = useOrder(id ?? '');
  const waitTracked = useRef(false);

  useEffect(() => {
    if (!orderQuery.data || orderQuery.data.state !== 'REVEAL_READY' || waitTracked.current) {
      return;
    }
    waitTracked.current = true;
    trackEvent('wait_complete', { orderId: orderQuery.data.id });
  }, [orderQuery.data]);

  return (
    <ScrollView
      contentContainerStyle={{
        paddingBottom: insets.bottom + space6,
        paddingTop: insets.top + space4,
        paddingHorizontal: space4,
      }}
      style={styles.screen}
    >
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <SectionHeader kicker="Tracker" title="Your haul" />

      {orderQuery.isLoading || !orderQuery.data ? (
        <ActivityIndicator color={wornInk} style={styles.loader} />
      ) : (
        <>
          <OrderTracker
            eta={nextEtaLabel(orderQuery.data)}
            orderId={`#${orderQuery.data.id.slice(0, 8)}`}
            steps={buildTrackerSteps(orderQuery.data)}
          />

          {orderQuery.data.state === 'REVEAL_READY' ? (
            <Button
              block
              label="Open your reveal"
              onPress={() => router.push(`/reveal/${orderQuery.data!.id}`)}
              style={styles.revealCta}
              variant="secondary"
            />
          ) : (
            <Text style={styles.polling}>Live updates every 5s</Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: {
    marginBottom: space4,
  },
  backText: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
  },
  loader: {
    marginTop: space6,
  },
  polling: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
    marginTop: space4,
    textAlign: 'center',
  },
  revealCta: {
    marginTop: space6,
  },
  screen: {
    backgroundColor: bg,
    flex: 1,
  },
});

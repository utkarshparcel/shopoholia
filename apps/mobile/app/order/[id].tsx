import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { RushToExpress } from '@/src/components/order/RushToExpress';
import { trackPlayBuyInCloset } from '@/src/api/client';
import { TrackBuySuccessSheet } from '@/src/components/TrackBuySuccessSheet';
import { Button, OrderTracker, SectionHeader } from '@/src/components/ui';
import { useOrder } from '@/src/hooks/orders';
import { trackEvent } from '@/src/lib/analytics';
import {
  TRACK_BUY_VAULT_HREF,
  TRACK_BUY_WARDROBE_HREF,
} from '@/src/lib/bridgeWow';
import { FEATURE_CLOSET } from '@/src/lib/features';
import { buildTrackerSteps, nextEtaLabel } from '@/src/lib/order-tracking';
import { useSessionStore } from '@/src/stores/session';
import {
  bg,
  fontSans,
  fontSansMedium,
  fsBody,
  fsCaption,
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
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [trackNote, setTrackNote] = useState<string | null>(null);
  const [successSheet, setSuccessSheet] = useState<{
    created: boolean;
    wardrobeCount: number;
  } | null>(null);

  const trackMutation = useMutation({
    mutationFn: async () => {
      if (!accessToken || !id) throw new Error('Sign in to track this buy');
      return trackPlayBuyInCloset(accessToken, id, true);
    },
    onSuccess: (result) => {
      trackEvent('play_buy_tracked', {
        orderId: id,
        created: result.created,
        wardrobeCount: result.wardrobeItemIds.length,
      });
      setTrackNote(
        result.created
          ? 'Saved to Closet — purchase + wardrobe seeded.'
          : 'Already tracked in Closet.',
      );
      setSuccessSheet({
        created: result.created,
        wardrobeCount: result.wardrobeItemIds.length,
      });
      void queryClient.invalidateQueries({ queryKey: ['order', id, accessToken] });
    },
    onError: (e) => setTrackNote((e as Error).message),
  });

  useEffect(() => {
    if (!orderQuery.data || orderQuery.data.state !== 'REVEAL_READY' || waitTracked.current) {
      return;
    }
    waitTracked.current = true;
    trackEvent('wait_complete', { orderId: orderQuery.data.id });
  }, [orderQuery.data]);

  const tracked = orderQuery.data?.trackedInCloset === true || trackMutation.data != null;

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

          {orderQuery.data.rushAvailable ? <RushToExpress order={orderQuery.data} /> : null}
          {FEATURE_CLOSET ? (
            <View style={styles.trackBlock}>
              <Button
                block
                disabled={tracked || trackMutation.isPending}
                label={
                  trackMutation.isPending
                    ? 'Saving to Closet…'
                    : tracked
                      ? 'Tracked in Closet'
                      : 'Track this buy in Closet'
                }
                onPress={() => trackMutation.mutate()}
                variant="secondary"
              />
              {trackNote ? <Text style={styles.trackNote}>{trackNote}</Text> : null}
              {tracked ? (
                <Button
                  block
                  label="Open Closet wardrobe"
                  onPress={() => router.push(TRACK_BUY_WARDROBE_HREF as never)}
                  style={styles.revealCta}
                  variant="primary"
                />
              ) : null}
            </View>
          ) : null}

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

      {FEATURE_CLOSET && successSheet ? (
        <TrackBuySuccessSheet
          visible
          created={successSheet.created}
          wardrobeCount={successSheet.wardrobeCount}
          onClose={() => setSuccessSheet(null)}
          onOpenVault={() => {
            setSuccessSheet(null);
            router.push(TRACK_BUY_VAULT_HREF as never);
          }}
          onOpenWardrobe={() => {
            setSuccessSheet(null);
            router.push(TRACK_BUY_WARDROBE_HREF as never);
          }}
        />
      ) : null}
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
  trackBlock: {
    gap: 8,
    marginTop: space6,
  },
  trackNote: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
  },
});

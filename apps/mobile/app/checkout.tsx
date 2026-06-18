import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { OrderSummary } from '@/src/api/client';
import { Button, Chip, CoinIcon, CoinWallet, SectionHeader } from '@/src/components/ui';
import { useCart } from '@/src/hooks/catalog';
import { useCheckout, useCoinBalance } from '@/src/hooks/orders';
import {
  bg,
  border,
  fontSansMedium,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  radiusCard,
  space4,
  space6,
  surface,
  text,
  textMuted,
  wornInk,
} from '@/src/theme/tokens';

const TIERS: Array<{
  id: OrderSummary['tier'];
  label: string;
  detail: string;
}> = [
  { id: 'EXPRESS', label: 'Express', detail: 'Beta arc ~5 min' },
  { id: 'STANDARD', label: 'Standard', detail: 'Same beta timers in dev' },
  { id: 'SLOW_BURN', label: 'Slow burn', detail: 'Stretch the anticipation' },
];

export default function CheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { query: cartQuery } = useCart();
  const { data: balanceData } = useCoinBalance();
  const checkout = useCheckout();
  const [tier, setTier] = useState<OrderSummary['tier']>('EXPRESS');

  const coinTotal = cartQuery.data?.coinTotal ?? 0;
  const balance = balanceData?.balance ?? 0;
  const canPay = coinTotal > 0 && balance >= coinTotal && !checkout.isPending;

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

      <View style={styles.header}>
        <SectionHeader kicker="Commit" title="Checkout" />
      </View>

      {cartQuery.isLoading ? (
        <ActivityIndicator color={wornInk} style={styles.loader} />
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.label}>Haul total</Text>
            <View style={styles.priceRow}>
              <CoinIcon />
              <Text style={styles.total}>{coinTotal}</Text>
            </View>
            <CoinWallet balance={balance} />
            {balance < coinTotal ? (
              <Text style={styles.warn}>Not enough coins for this haul.</Text>
            ) : null}
          </View>

          <View style={styles.tierBlock}>
            <Text style={styles.label}>Delivery tier</Text>
            <View style={styles.tierRow}>
              {TIERS.map((option) => (
                <Chip
                  key={option.id}
                  active={tier === option.id}
                  label={option.label}
                  onPress={() => setTier(option.id)}
                />
              ))}
            </View>
            <Text style={styles.tierDetail}>
              {TIERS.find((t) => t.id === tier)?.detail}
            </Text>
          </View>

          <View style={styles.actions}>
            <Button
              block
              disabled={!canPay}
              label={checkout.isPending ? 'Placing order…' : 'Pay with coins'}
              onPress={() => {
                void checkout.mutateAsync(tier).then((order) => {
                  router.replace(`/order/${order.id}`);
                });
              }}
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  actions: {
    marginHorizontal: space4,
    marginTop: space6,
  },
  back: {
    marginBottom: space4,
    paddingHorizontal: space4,
  },
  backText: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
  },
  card: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusCard,
    borderWidth: 1,
    gap: 12,
    marginHorizontal: space4,
    padding: space4,
  },
  header: {
    paddingHorizontal: space4,
  },
  label: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  loader: {
    marginTop: space6,
  },
  priceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  screen: {
    backgroundColor: bg,
    flex: 1,
  },
  tierBlock: {
    gap: 12,
    marginHorizontal: space4,
    marginTop: space6,
  },
  tierDetail: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
  },
  tierRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  total: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: 28,
  },
  warn: {
    color: '#9a4d3a',
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
  },
});

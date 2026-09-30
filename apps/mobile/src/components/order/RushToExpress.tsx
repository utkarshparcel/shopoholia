import { useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';

import type { OrderSummary } from '@/src/api/client';
import { Button } from '@/src/components/ui';
import { isInsufficientCoinsError, useRushOrder } from '@/src/hooks/orders';
import { useSessionStore } from '@/src/stores/session';
import { fontSans, fontSansMedium, fsCaption, space6, textMuted } from '@/src/theme/tokens';

/** Offers to pay coins to put an in-transit order on the Express schedule. */
export function RushToExpress({ order }: { order: OrderSummary }) {
  const router = useRouter();
  const rush = useRushOrder(order.id);
  const coinBalance = useSessionStore((s) => s.coinBalance);
  const cost = order.rushCostCoins;
  // The balance is refreshed when a rush is refused, so this is current after a 402.
  const deficit = Math.max(0, cost - coinBalance);

  const confirmRush = () => {
    Alert.alert(
      'Rush to Express?',
      `Spend ${cost} coins to move this haul onto the Express schedule.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Rush it',
          onPress: () =>
            rush.mutate(undefined, {
              onError: (error) => {
                if (!isInsufficientCoinsError(error)) {
                  Alert.alert('Couldn’t rush', error.message);
                }
              },
            }),
        },
      ],
    );
  };

  return (
    <View style={styles.block}>
      <Text style={styles.hint}>In a hurry? Move this haul onto the Express schedule.</Text>
      <Button
        block
        disabled={rush.isPending}
        label={rush.isPending ? 'Rushing…' : `Rush to Express · ${cost} coins`}
        onPress={confirmRush}
        variant="secondary"
      />
      {isInsufficientCoinsError(rush.error) ? (
        <View style={styles.deficitBlock}>
          <Text style={styles.warn}>
            {deficit > 0
              ? `You need ${deficit} more coins to rush this haul.`
              : 'Not enough coins to rush this haul.'}
          </Text>
          <Button
            block
            label={deficit > 0 ? `Get ${deficit} coins` : 'Get coins'}
            onPress={() => router.push('/coins/buy' as never)}
            variant="secondary"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 10,
    marginTop: space6,
  },
  deficitBlock: {
    gap: 10,
  },
  hint: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
  },
  warn: {
    color: '#9a4d3a',
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
  },
});

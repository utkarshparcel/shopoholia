import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, CoinIcon, LoadError, SectionHeader } from '@/src/components/ui';
import { notify } from '@/src/lib/confirm';
import { errorText } from '@/src/lib/errorText';
import { goBack } from '@/src/lib/goBack';
import { useCart } from '@/src/hooks/catalog';
import {
  bg,
  border,
  fontDisplay,
  fontMono,
  fontSans,
  fontSansMedium,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  fsDisplayM,
  fsMicro,
  radiusCard,
  space4,
  space6,
  space10,
  surface,
  text,
  textMuted,
  trackingTight,
  wornInk,
} from '@/src/theme/tokens';

export default function CartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { query, removeMutation } = useCart();

  const data = query.data;
  const coinTotal = data?.coinTotal ?? 0;
  // A failed load isn't an empty haul; that one gets its own state below.
  const loadFailed = !data && query.isError;
  const isEmpty = !query.isLoading && !loadFailed && (!data || data.items.length === 0);
  const removingId = removeMutation.isPending ? removeMutation.variables : null;

  const remove = (variantId: string) => {
    if (removeMutation.isPending) return;
    removeMutation.mutate(variantId, {
      onError: (error) => notify('Couldn’t remove it', errorText(error, 'Try again.')),
    });
  };

  return (
    <ScrollView
      contentContainerStyle={{
        paddingBottom: insets.bottom + space6,
        paddingTop: insets.top + space4,
      }}
      style={styles.screen}
    >
      <Pressable accessibilityRole="button" onPress={() => goBack(router)} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <View style={styles.header}>
        <SectionHeader kicker="Your haul" title="Cart" />
      </View>

      {query.isLoading ? (
        <ActivityIndicator color={wornInk} style={styles.loader} />
      ) : loadFailed ? (
        <LoadError
          error={query.error}
          onRetry={() => void query.refetch()}
          title="Couldn’t load your haul"
        />
      ) : isEmpty ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconText}>⊞</Text>
          </View>
          <Text style={styles.emptyTitle}>Your haul is empty</Text>
          <Text style={styles.emptyBody}>
            Browse the feed and tap + to add pieces to your cart.
          </Text>
          <Button
            label="Browse feed"
            onPress={() => router.push('/(tabs)/feed')}
            variant="primary"
            block
          />
        </View>
      ) : (
        <>
          {data!.items.map((item) => (
            <View key={item.variantId} style={styles.item}>
              <Image source={{ uri: item.imageUrl }} style={styles.thumb} />
              <View style={styles.itemBody}>
                <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.itemMeta}>
                  {item.size} · {item.color}
                </Text>
                <View style={styles.priceRow}>
                  <CoinIcon />
                  <Text style={styles.price}>{item.coinPriceSnapshot * item.quantity}</Text>
                  <Text style={styles.qty}>×{item.quantity}</Text>
                </View>
              </View>
              <Pressable
                accessibilityLabel={`Remove ${item.title}`}
                accessibilityRole="button"
                accessibilityState={{ busy: removingId === item.variantId, disabled: removeMutation.isPending }}
                disabled={removeMutation.isPending}
                hitSlop={8}
                onPress={() => remove(item.variantId)}
                style={[styles.remove, removeMutation.isPending && styles.removeBusy]}
              >
                {removingId === item.variantId ? (
                  <ActivityIndicator color={wornInk} size="small" />
                ) : (
                  <Text style={styles.removeText}>✕</Text>
                )}
              </Pressable>
            </View>
          ))}

          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Haul total</Text>
            <View style={styles.priceRow}>
              <CoinIcon />
              <Text style={styles.totalValue}>{coinTotal}</Text>
            </View>
            {data?.coolingOff?.active ? (
              <Text style={styles.coolingNote}>{data.coolingOff.message}</Text>
            ) : null}
            <Button
              block
              disabled={coinTotal <= 0 || removeMutation.isPending}
              label="Checkout"
              onPress={() => router.push('/checkout')}
            />
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
  emptyBody: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsBody,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: '#f0ece4',
    borderRadius: 40,
    height: 80,
    justifyContent: 'center',
    marginBottom: space4,
    width: 80,
  },
  emptyIconText: {
    color: '#6e6861',
    fontSize: 32,
  },
  emptyState: {
    alignItems: 'center',
    gap: 12,
    marginTop: space10,
    paddingHorizontal: space6,
  },
  emptyTitle: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayM,
    letterSpacing: fsDisplayM * trackingTight,
  },
  header: {
    paddingHorizontal: space4,
  },
  item: {
    alignItems: 'center',
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusCard,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    marginHorizontal: space4,
    padding: 12,
  },
  itemBody: {
    flex: 1,
  },
  itemMeta: {
    color: textMuted,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: 0.8,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  itemTitle: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  loader: {
    marginTop: space6,
  },
  price: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  priceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  qty: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
  },
  remove: {
    alignItems: 'center',
    backgroundColor: '#f0ece4',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  removeBusy: {
    opacity: 0.5,
  },
  removeText: {
    color: textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  screen: {
    backgroundColor: bg,
    flex: 1,
  },
  thumb: {
    borderRadius: 10,
    height: 72,
    width: 56,
  },
  totalCard: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusCard,
    borderWidth: 1,
    gap: 12,
    marginHorizontal: space4,
    marginTop: space6,
    padding: space4,
  },
  totalLabel: {
    color: textMuted,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  totalValue: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: 28,
  },
  coolingNote: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
  },
});

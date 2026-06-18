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

import { Button, CoinIcon, SectionHeader } from '@/src/components/ui';
import { useCart } from '@/src/hooks/catalog';
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

export default function CartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { query, removeMutation } = useCart();

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
        <SectionHeader kicker="Your haul" title="Cart" />
      </View>

      {query.isLoading ? (
        <ActivityIndicator color={wornInk} style={styles.loader} />
      ) : query.data && query.data.items.length > 0 ? (
        <>
          {query.data.items.map((item) => (
            <View key={item.variantId} style={styles.item}>
              <Image source={{ uri: item.imageUrl }} style={styles.thumb} />
              <View style={styles.itemBody}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemMeta}>
                  {item.size} · {item.color} · Qty {item.quantity}
                </Text>
                <View style={styles.priceRow}>
                  <CoinIcon />
                  <Text style={styles.price}>{item.coinPriceSnapshot * item.quantity}</Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => void removeMutation.mutateAsync(item.variantId)}
                style={styles.remove}
              >
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          ))}

          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Haul total</Text>
            <View style={styles.priceRow}>
              <CoinIcon />
              <Text style={styles.totalValue}>{query.data.coinTotal}</Text>
            </View>
            <Button
              block
              disabled={!query.data || query.data.coinTotal <= 0}
              label="Checkout"
              onPress={() => router.push('/checkout')}
            />
          </View>
        </>
      ) : (
        <Text style={styles.empty}>Your haul is empty. Browse the feed to add pieces.</Text>
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
  empty: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
    paddingHorizontal: space4,
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
    marginBottom: 12,
    marginHorizontal: space4,
    padding: 12,
  },
  itemBody: {
    flex: 1,
  },
  itemMeta: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
    marginTop: 2,
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
  remove: {
    padding: 8,
  },
  removeText: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
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
    marginTop: space4,
    padding: space4,
  },
  totalLabel: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  totalValue: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: 24,
  },
});

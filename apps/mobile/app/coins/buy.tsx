import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, SectionHeader } from '@/src/components/ui';
import { validateIap } from '@/src/api/client';
import { useSessionStore } from '@/src/stores/session';
import { useCoinBalance } from '@/src/hooks/orders';
import { trackEvent } from '@/src/lib/analytics';
import {
  bg,
  border,
  fontDisplay,
  fontMono,
  fontSans,
  fontSansMedium,
  fontSansSemiBold,
  fsBody,
  fsBodyL,
  fsCaption,
  fsDisplayM,
  fsMicro,
  radiusCard,
  radiusLg,
  space4,
  space6,
  surface,
  text,
  textBody,
  textMuted,
  trackingTight,
  wornGold,
  wornGoldDeep,
  wornGoldTint,
  wornInk,
  wornPaper,
} from '@/src/theme/tokens';

const PACKS = [
  { id: 'coins_small', label: 'Starter Pack', price: '₹99', coins: 100 },
  { id: 'coins_medium', label: 'Style Pack', price: '₹299', coins: 350 },
  { id: 'coins_large', label: 'Premium Pack', price: '₹499', coins: 650, popular: true },
  { id: 'coins_xl', label: 'Ultimate Pack', price: '₹999', coins: 1500, bestValue: true },
];

export default function BuyCoinsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accessToken = useSessionStore((s) => s.accessToken);
  const setCoinBalance = useSessionStore((s) => s.setCoinBalance);
  const { data: balanceData } = useCoinBalance();
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const handlePurchase = async (pack: typeof PACKS[number]) => {
    if (!accessToken) {
      Alert.alert('Sign in', 'Please sign in to purchase coins.');
      return;
    }
    setPurchasing(pack.id);
    try {
      const result = await validateIap(accessToken, pack.id, `simulated-receipt-${pack.id}-${Date.now()}`);
      setCoinBalance(result.balanceAfter);
      trackEvent('iap_purchase', { productId: pack.id, coins: pack.coins });
      Alert.alert(
        'Coins added!',
        `You got ${pack.coins} WORN coins.`,
        [{ text: 'Great!', onPress: () => router.back() }],
      );
    } catch (error) {
      Alert.alert('Purchase failed', error instanceof Error ? error.message : 'Try again');
    } finally {
      setPurchasing(null);
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

      <View style={styles.heroSection}>
        <View style={styles.coinIconLarge}>
          <View style={styles.coinIconInner} />
        </View>
        <Text style={styles.heroTitle}>Get more coins</Text>
        <Text style={styles.heroBody}>
          Unlock premium renders, generate new scenes, and combine items into full looks.
        </Text>
        {balanceData ? (
          <View style={styles.currentBalance}>
            <Text style={styles.balanceLabel}>Your balance</Text>
            <Text style={styles.balanceValue}>{balanceData.balance} coins</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.packGrid}>
        {PACKS.map((pack) => {
          const isPopular = 'popular' in pack && pack.popular;
          const isBestValue = 'bestValue' in pack && pack.bestValue;
          const loading = purchasing === pack.id;

          return (
            <Pressable
              key={pack.id}
              accessibilityRole="button"
              disabled={loading}
              onPress={() => void handlePurchase(pack)}
              style={({ pressed }) => [
                styles.packCard,
                isPopular && styles.packCardPopular,
                pressed && { opacity: 0.85 },
              ]}
            >
              {isPopular ? (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>Most popular</Text>
                </View>
              ) : null}
              {isBestValue ? (
                <View style={[styles.popularBadge, styles.bestValueBadge]}>
                  <Text style={styles.popularText}>Best value</Text>
                </View>
              ) : null}

              <Text style={styles.packCoins}>{pack.coins.toLocaleString()}</Text>
              <Text style={styles.packLabel}>{pack.label}</Text>

              {loading ? (
                <ActivityIndicator color={wornInk} style={styles.packLoader} />
              ) : (
                <View style={styles.packPriceRow}>
                  <Text style={styles.packPrice}>{pack.price}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.perksCard}>
        <Text style={styles.perksTitle}>What you can do with coins</Text>
        <View style={styles.perkRow}>
          <Text style={styles.perkIcon}>✦</Text>
          <Text style={styles.perkText}>Unlock premium scenes (50 coins each)</Text>
        </View>
        <View style={styles.perkRow}>
          <Text style={styles.perkIcon}>✦</Text>
          <Text style={styles.perkText}>Generate new renders in any scenario (50 coins)</Text>
        </View>
        <View style={styles.perkRow}>
          <Text style={styles.perkIcon}>✦</Text>
          <Text style={styles.perkText}>Combine items into full looks (75 coins)</Text>
        </View>
        <View style={styles.perkRow}>
          <Text style={styles.perkIcon}>✦</Text>
          <Text style={styles.perkText}>Rush delivery to Express tier (25 coins)</Text>
        </View>
      </View>
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
  balanceLabel: {
    color: textMuted,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  balanceValue: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: 24,
  },
  bestValueBadge: {
    backgroundColor: wornGoldDeep,
  },
  coinIconInner: {
    borderColor: 'rgba(255,255,255,0.45)',
    borderRadius: 8,
    borderWidth: 1.5,
    height: 16,
    width: 16,
  },
  coinIconLarge: {
    alignItems: 'center',
    backgroundColor: wornGold,
    borderRadius: 40,
    height: 80,
    justifyContent: 'center',
    marginBottom: space4,
    width: 80,
  },
  currentBalance: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    marginTop: space4,
  },
  heroBody: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsBody,
    lineHeight: 22,
    paddingHorizontal: space6,
    textAlign: 'center',
  },
  heroSection: {
    alignItems: 'center',
    gap: 8,
    marginBottom: space6,
    paddingHorizontal: space4,
  },
  heroTitle: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayM,
    letterSpacing: fsDisplayM * trackingTight,
  },
  packCard: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusLg,
    borderWidth: 1,
    flex: 1,
    gap: 8,
    minHeight: 140,
    padding: space4,
    position: 'relative',
  },
  packCardPopular: {
    borderColor: wornGold,
    backgroundColor: wornGoldTint,
  },
  packCoins: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: 28,
    letterSpacing: fsDisplayM * trackingTight,
  },
  packGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space4,
    paddingHorizontal: space4,
  },
  packLabel: {
    color: textMuted,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  packLoader: {
    marginTop: 8,
  },
  packPrice: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBodyL,
  },
  packPriceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: 'auto',
  },
  perkIcon: {
    color: wornGoldDeep,
    fontSize: 12,
    width: 20,
  },
  perkRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  perkText: {
    color: textBody,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 20,
    flex: 1,
  },
  perksCard: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusCard,
    borderWidth: 1,
    gap: 10,
    marginHorizontal: space4,
    marginTop: space6,
    padding: space4,
  },
  perksTitle: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
    marginBottom: 4,
  },
  popularBadge: {
    alignSelf: 'flex-start',
    backgroundColor: wornGold,
    borderRadius: 999,
    marginBottom: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  popularText: {
    color: wornPaper,
    fontFamily: fontMono,
    fontSize: 8,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  screen: {
    backgroundColor: bg,
    flex: 1,
  },
});

import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, CoinWallet } from '@/src/components/ui';
import { fetchOrders } from '@/src/api/client';
import { useCoinBalance } from '@/src/hooks/orders';
import { useSessionStore } from '@/src/stores/session';
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
  space4,
  space6,
  surface,
  text,
  textMuted,
  wornGold,
  wornPaper,
  trackingTight,
} from '@/src/theme/tokens';

const MENU = [
  { label: 'Get more coins', href: '/coins/buy' },
  { label: 'Daily streak', href: '/streaks' },
  { label: 'Refer & earn', href: '/referral' },
  { label: 'Cashback', href: '/cashback' },
  { label: 'Style quiz', href: '/style-quiz' },
  { label: 'Edit avatar', href: '/(onboarding)/avatar' },
] as const;

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const accessToken = useSessionStore((s) => s.accessToken);
  const { data: balanceData } = useCoinBalance();

  const { data: ordersData } = useQuery({
    queryKey: ['orders', accessToken],
    queryFn: () => fetchOrders(accessToken ?? ''),
    enabled: Boolean(accessToken),
  });

  const orders = ordersData?.orders ?? [];
  const revealReady = orders.find((o) => o.state === 'REVEAL_READY');
  const activeOrders = orders.filter((o) => o.state !== 'REVEAL_READY').slice(0, 5);
  const listOrders = revealReady
    ? [revealReady, ...activeOrders.filter((o) => o.id !== revealReady.id)].slice(0, 5)
    : activeOrders;

  return (
    <FlatList
      data={listOrders}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={{ paddingTop: insets.top + space6 }}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.greeting}>Your profile</Text>
              <Text style={styles.subtext}>Orders · Coins · Rewards</Text>
            </View>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarLetter}>Y</Text>
            </View>
          </View>

          {revealReady ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/reveal/${revealReady.id}`)}
              style={({ pressed }) => [styles.revealHero, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.revealKicker}>Reveal ready</Text>
              <Text style={styles.revealTitle}>Your haul is ready to open</Text>
              <Text style={styles.revealCta}>Open reveal →</Text>
            </Pressable>
          ) : null}

          <View style={styles.walletRow}>
            <CoinWallet
              balance={balanceData?.balance ?? 0}
              onAdd={() => router.push('/coins/buy' as never)}
            />
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{orders.length}</Text>
              <Text style={styles.statLabel}>Orders</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {orders.filter((o) => o.state === 'REVEAL_READY').length}
              </Text>
              <Text style={styles.statLabel}>Reveals ready</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {orders.filter((o) => !['REVEAL_READY', 'CANCELLED', 'FAILED'].includes(o.state)).length}
              </Text>
              <Text style={styles.statLabel}>In transit</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your orders</Text>
          </View>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.emptyBody}>
            Your welcome coins are ready — pick a piece and start your first haul.
          </Text>
          <Button
            label="Browse feed"
            onPress={() => router.push('/(tabs)/feed')}
            variant="primary"
            block
          />
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push(
              item.state === 'REVEAL_READY' ? `/reveal/${item.id}` : `/order/${item.id}`,
            )
          }
          style={({ pressed }) => [styles.orderCard, pressed && { opacity: 0.7 }]}
        >
          <View style={styles.orderCardTop}>
            <Text style={styles.orderId}>#{item.id.slice(0, 8)}</Text>
            <View style={[styles.stateBadge, item.state === 'REVEAL_READY' && styles.stateReady]}>
              <Text style={[styles.stateText, item.state === 'REVEAL_READY' && styles.stateReadyText]}>
                {item.state === 'REVEAL_READY' ? 'Ready' : 'In transit'}
              </Text>
            </View>
          </View>
          <Text style={styles.orderTier}>{item.tier} delivery</Text>
          <Text style={styles.orderTotal}>{item.coinTotal} coins</Text>
        </Pressable>
      )}
      ListFooterComponent={
        <View style={styles.footer}>
          <View style={styles.divider} />
          {MENU.map((item) => (
            <Pressable
              key={item.href}
              accessibilityRole="button"
              onPress={() => router.push(item.href as never)}
              style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.menuItemText}>{item.label}</Text>
              <Text style={styles.menuItemArrow}>→</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              useSessionStore.getState().clear();
              router.replace('/(auth)/login' as never);
            }}
            style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.menuItemText}>Sign out</Text>
            <Text style={styles.menuItemArrow}>→</Text>
          </Pressable>
          <View style={styles.divider} />
          <Text style={styles.footerNote}>WORN · The shopping arc is the product</Text>
        </View>
      }
      contentContainerStyle={{
        paddingBottom: insets.bottom + 100,
        paddingHorizontal: space4,
      }}
      style={styles.screen}
    />
  );
}

const styles = StyleSheet.create({
  avatarCircle: {
    alignItems: 'center',
    backgroundColor: wornGold,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  avatarLetter: {
    color: wornPaper,
    fontFamily: fontDisplay,
    fontSize: 20,
  },
  divider: {
    backgroundColor: border,
    height: 1,
  },
  emptyBody: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsBody,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: space4,
    paddingVertical: space6,
  },
  emptyTitle: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayM,
    letterSpacing: fsDisplayM * trackingTight,
  },
  footer: {
    gap: 0,
    marginTop: space6,
  },
  footerNote: {
    color: textMuted,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: 1,
    marginTop: space4,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  greeting: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayM,
    letterSpacing: fsDisplayM * trackingTight,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: space6,
  },
  menuItem: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  menuItemArrow: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
  },
  menuItemText: {
    color: text,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
  },
  orderCard: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusCard,
    borderWidth: 1,
    gap: 4,
    marginBottom: 8,
    padding: space4,
  },
  orderCardTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  orderId: {
    color: text,
    fontFamily: fontMono,
    fontSize: fsCaption,
  },
  orderTier: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    marginTop: 2,
  },
  orderTotal: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
    marginTop: 4,
  },
  revealCta: {
    color: wornPaper,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
    marginTop: 12,
  },
  revealHero: {
    backgroundColor: '#1a1916',
    borderRadius: radiusCard,
    marginBottom: space6,
    padding: space4,
  },
  revealKicker: {
    color: wornGold,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  revealTitle: {
    color: wornPaper,
    fontFamily: fontDisplay,
    fontSize: fsDisplayM,
    marginTop: 6,
  },
  screen: {
    backgroundColor: bg,
    flex: 1,
  },
  section: {
    marginBottom: space4,
  },
  sectionTitle: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBodyL,
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusCard,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    paddingVertical: 14,
  },
  statLabel: {
    color: textMuted,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  statValue: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: 22,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: space6,
  },
  stateBadge: {
    backgroundColor: 'rgba(200,168,122,0.12)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  stateReady: {
    backgroundColor: '#3a7d5c20',
  },
  stateReadyText: {
    color: '#3a7d5c',
  },
  stateText: {
    color: '#9c7a4e',
    fontFamily: fontMono,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  subtext: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    marginTop: 4,
  },
  walletRow: {
    marginBottom: space4,
  },
});

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { playDupRebuyBanner } from '@worn/shared';

import type { OrderSummary } from '@/src/api/client';
import { fetchCredits, fetchPrebuyFit } from '@/src/api/client';
import { Button, CoinIcon, CoinWallet, SectionHeader } from '@/src/components/ui';
import { useCart } from '@/src/hooks/catalog';
import { useCheckout, useCoinBalance } from '@/src/hooks/orders';
import {
  BUDGET_NUDGE_SOFT_FOOTER,
  closetBudgetSoftGateCopy,
  matchStoreCreditHint,
  prebuyFitPanelSections,
  TRACK_BUY_VAULT_HREF,
} from '@/src/lib/bridgeWow';
import { FEATURE_CLOSET } from '@/src/lib/features';
import { useSessionStore } from '@/src/stores/session';
import {
  bg,
  border,
  fontMono,
  fontSans,
  fontSansMedium,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  fsMicro,
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
  icon: string;
}> = [
  { id: 'EXPRESS', label: 'Express', detail: 'Fastest arc — ~5 min in beta', icon: '▸' },
  { id: 'STANDARD', label: 'Standard', detail: 'Balanced pace — beta ~5 min', icon: '→' },
  { id: 'SLOW_BURN', label: 'Slow burn', detail: 'Maximum anticipation — beta ~5 min', icon: '⟳' },
];

export default function CheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { query: cartQuery } = useCart();
  const { data: balanceData } = useCoinBalance();
  const checkout = useCheckout();
  const [tier, setTier] = useState<OrderSummary['tier']>('EXPRESS');
  const [closetOpen, setClosetOpen] = useState(false);
  const [coolingHold, setCoolingHold] = useState<{
    message: string;
    releaseAt?: string;
  } | null>(null);
  const accessToken = useSessionStore((s) => s.accessToken);

  const items = cartQuery.data?.items ?? [];
  const coinTotal = cartQuery.data?.coinTotal ?? 0;
  const itemCount = items.length;
  const balance = balanceData?.balance ?? 0;
  const canPay = coinTotal > 0 && balance >= coinTotal && !checkout.isPending;
  const deficit = Math.max(0, coinTotal - balance);
  const cartCooling = cartQuery.data?.coolingOff?.active ? cartQuery.data.coolingOff : null;
  const showCooling = coolingHold ?? (cartCooling
    ? { message: cartCooling.message, releaseAt: cartCooling.releaseAt }
    : null);

  const prebuyQuery = useQuery({
    queryKey: ['prebuy', 'fit', accessToken, itemCount, coinTotal],
    queryFn: () => {
      if (!accessToken) throw new Error('Sign in');
      return fetchPrebuyFit(accessToken, true);
    },
    enabled: Boolean(accessToken && FEATURE_CLOSET && itemCount > 0),
  });

  const creditsQuery = useQuery({
    queryKey: ['credits', 'checkout-hint', accessToken],
    queryFn: () => {
      if (!accessToken) throw new Error('Sign in');
      return fetchCredits(accessToken);
    },
    enabled: Boolean(accessToken && FEATURE_CLOSET && itemCount > 0),
  });

  const prebuy = prebuyQuery.data;
  const budgetNudge = prebuy?.primaryBudgetNudge;
  const fitPanel = prebuy
    ? prebuyFitPanelSections({
        score: prebuy.score,
        summary: prebuy.summary,
        overlaps: prebuy.overlaps,
        gaps: prebuy.gaps,
        budgetNudges: prebuy.budgetNudges,
      })
    : null;

  /** W040 — soft dup/rebuy banner on Play only; never gates canPay. */
  const dupBanner = useMemo(
    () =>
      FEATURE_CLOSET
        ? playDupRebuyBanner({ overlaps: prebuy?.overlaps ?? [] })
        : null,
    [prebuy?.overlaps],
  );

  const creditHint = useMemo(
    () =>
      matchStoreCreditHint(
        creditsQuery.data?.accounts ?? [],
        items.map((i) => i.title),
      ),
    [creditsQuery.data?.accounts, items],
  );

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
      ) : itemCount === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Nothing to check out</Text>
          <Text style={styles.emptyBody}>Add pieces to your haul before paying with coins.</Text>
          <Button
            label="Browse feed"
            onPress={() => router.replace('/(tabs)/feed')}
            variant="primary"
            block
          />
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Your haul</Text>
              <Text style={styles.cardItemCount}>
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </Text>
            </View>
            {items.map((item) => (
              <View key={item.variantId} style={styles.lineItem}>
                <View style={styles.lineMeta}>
                  <Text style={styles.lineTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.lineVariant}>
                    {item.size} · {item.color} · ×{item.quantity}
                  </Text>
                </View>
                <Text style={styles.linePrice}>{item.coinPriceSnapshot * item.quantity}</Text>
              </View>
            ))}
            <View style={styles.priceRow}>
              <CoinIcon />
              <Text style={styles.total}>{coinTotal}</Text>
            </View>
            <CoinWallet balance={balance} onAdd={() => router.push('/coins/buy' as never)} />
            {deficit > 0 ? (
              <View style={styles.deficitBlock}>
                <Text style={styles.warn}>You need {deficit} more coins for this haul.</Text>
                <Button
                  label={`Get ${deficit} coins`}
                  onPress={() => router.push('/coins/buy' as never)}
                  variant="secondary"
                  block
                />
              </View>
            ) : null}
          </View>

          {FEATURE_CLOSET && budgetNudge?.exceeded ? (
            <View style={styles.nudgeCard} testID="budget-nudge-banner">
              <Text style={styles.nudgeKicker}>
                {closetBudgetSoftGateCopy({
                  exceeded: true,
                  category: budgetNudge.category,
                  message: budgetNudge.message,
                })?.title ?? 'Spend awareness'}
              </Text>
              <Text style={styles.nudgeBody}>{budgetNudge.message}</Text>
              <Text style={styles.nudgeSoft}>{BUDGET_NUDGE_SOFT_FOOTER}</Text>
              <View style={styles.budgetGateRow}>
                <Button
                  label={
                    closetBudgetSoftGateCopy({ exceeded: true })?.continueLabel ?? 'Continue'
                  }
                  onPress={() => {
                    /* soft only — pay CTA below stays enabled */
                  }}
                  variant="secondary"
                  testID="budget-gate-continue"
                />
                <Button
                  label={
                    closetBudgetSoftGateCopy({ exceeded: true })?.cutSpendLabel ?? 'Cut spend'
                  }
                  onPress={() => router.push('/(closet)/accountant' as never)}
                  variant="secondary"
                  testID="budget-gate-cut-spend"
                />
              </View>
            </View>
          ) : null}

          {FEATURE_CLOSET && dupBanner ? (
            <View style={styles.nudgeCard} testID="dup-rebuy-banner">
              <Text style={styles.nudgeKicker}>{dupBanner.kicker}</Text>
              <Text style={styles.nudgeBody}>{dupBanner.message}</Text>
              {dupBanner.detail ? (
                <Text style={styles.nudgeSoft}>{dupBanner.detail}</Text>
              ) : null}
              <Text style={styles.nudgeSoft}>{dupBanner.softNote}</Text>
              <Button
                label={dupBanner.closetLabel}
                size="sm"
                variant="secondary"
                onPress={() => router.push(dupBanner.closetHref as never)}
              />
            </View>
          ) : null}

          {FEATURE_CLOSET && creditHint ? (
            <View style={styles.nudgeCard} testID="pay-with-credit-hint">
              <Text style={styles.nudgeKicker}>Vault credit</Text>
              <Text style={styles.nudgeBody}>{creditHint.message}</Text>
              <Text style={styles.nudgeSoft}>{creditHint.softNote}</Text>
              <Button
                label="Open Vault"
                size="sm"
                variant="secondary"
                onPress={() => router.push(TRACK_BUY_VAULT_HREF as never)}
              />
            </View>
          ) : null}

          {FEATURE_CLOSET && showCooling ? (
            <View style={styles.nudgeCard}>
              <Text style={styles.nudgeKicker}>Cooling-off</Text>
              <Text style={styles.nudgeBody}>{showCooling.message}</Text>
              <Text style={styles.nudgeSoft}>
                Soft lock for impulse buys — wait it out or confirm override below.
              </Text>
            </View>
          ) : null}

          {FEATURE_CLOSET && itemCount > 0 ? (
            <View style={styles.closetBlock}>
              <Button
                block
                label={closetOpen ? 'Hide closet check' : 'Check my closet'}
                onPress={() => setClosetOpen((v) => !v)}
                variant="secondary"
              />
              {closetOpen ? (
                <View style={styles.closetPanel} testID="prebuy-fit-panel">
                  {prebuyQuery.isLoading ? (
                    <ActivityIndicator color={wornInk} />
                  ) : fitPanel ? (
                    <>
                      <Text style={styles.closetScore}>{fitPanel.scoreLabel}</Text>
                      <Text style={styles.closetSummary}>{fitPanel.summary}</Text>
                      <Text style={styles.nudgeSoft}>{fitPanel.softNote}</Text>
                      {fitPanel.overlapLines.map((line) => (
                        <Text key={line} style={styles.closetLine}>
                          {line}
                        </Text>
                      ))}
                      {fitPanel.gapLines.map((line) => (
                        <Text key={line} style={styles.closetLine}>
                          {line}
                        </Text>
                      ))}
                      {fitPanel.budgetLines.map((line) => (
                        <Text key={line} style={styles.warn}>
                          {line}
                        </Text>
                      ))}
                    </>
                  ) : (
                    <Text style={styles.closetSummary}>Couldn’t load closet fit.</Text>
                  )}
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.tierBlock}>
            <Text style={styles.sectionLabel}>Delivery tier</Text>
            <Text style={styles.tierHint}>
              Coins price the haul. Tier sets how long you wait before the reveal opens.
            </Text>
            <View style={styles.tierGrid}>
              {TIERS.map((option) => {
                const active = tier === option.id;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    onPress={() => setTier(option.id)}
                    style={[styles.tierCard, active && styles.tierCardActive]}
                  >
                    <Text style={styles.tierIcon}>{option.icon}</Text>
                    <Text style={[styles.tierLabel, active && styles.tierLabelActive]}>
                      {option.label}
                    </Text>
                    <Text style={styles.tierDetail}>{option.detail}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.actions}>
            <Button
              block
              disabled={!canPay}
              label={checkout.isPending ? 'Placing order…' : 'Pay with coins'}
              onPress={() => {
                void checkout
                  .mutateAsync(tier)
                  .then((order) => {
                    setCoolingHold(null);
                    router.replace(`/order/${order.id}`);
                  })
                  .catch((err: Error & { code?: string; coolingOff?: { releaseAt: string } | null }) => {
                    if (err.code === 'COOLING_OFF') {
                      setCoolingHold({
                        message: err.message,
                        releaseAt: err.coolingOff?.releaseAt,
                      });
                      void cartQuery.refetch();
                    }
                  });
              }}
            />
            {FEATURE_CLOSET && showCooling ? (
              <Button
                block
                disabled={!canPay}
                label={checkout.isPending ? 'Placing order…' : 'Confirm override & pay'}
                onPress={() => {
                  void checkout
                    .mutateAsync({ tier, coolingOffOverride: true })
                    .then((order) => {
                      setCoolingHold(null);
                      router.replace(`/order/${order.id}`);
                    });
                }}
                variant="secondary"
              />
            ) : null}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 10,
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
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardItemCount: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
  },
  cardTitle: {
    color: textMuted,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  closetBlock: {
    gap: 10,
    marginHorizontal: space4,
    marginTop: space4,
  },
  closetLine: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
  },
  closetPanel: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusCard,
    borderWidth: 1,
    gap: 8,
    padding: space4,
  },
  closetScore: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  closetSummary: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
  },
  deficitBlock: {
    gap: 10,
  },
  emptyBody: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 20,
    marginBottom: space6,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    marginHorizontal: space4,
    marginTop: space6,
    padding: space4,
  },
  emptyTitle: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  header: {
    paddingHorizontal: space4,
  },
  lineItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  lineMeta: {
    flex: 1,
  },
  linePrice: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  lineTitle: {
    color: text,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
  },
  lineVariant: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    marginTop: 2,
  },
  loader: {
    marginTop: space6,
  },
  nudgeBody: {
    color: text,
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
    lineHeight: 18,
  },
  nudgeCard: {
    backgroundColor: '#fdf7ee',
    borderColor: '#9c7a4e',
    borderRadius: radiusCard,
    borderWidth: 1,
    gap: 6,
    marginHorizontal: space4,
    marginTop: space4,
    padding: space4,
  },
  nudgeKicker: {
    color: textMuted,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  nudgeSoft: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: 11,
  },
  budgetGateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  priceRow: {
    alignItems: 'center',
    borderTopColor: border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
  },
  screen: {
    backgroundColor: bg,
    flex: 1,
  },
  sectionLabel: {
    color: textMuted,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: 1.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  tierBlock: {
    marginHorizontal: space4,
    marginTop: space6,
  },
  tierCard: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusCard,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    padding: 12,
  },
  tierCardActive: {
    borderColor: '#9c7a4e',
    backgroundColor: '#fdf7ee',
  },
  tierDetail: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: 11,
    lineHeight: 15,
  },
  tierGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  tierHint: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
    marginBottom: 12,
  },
  tierIcon: {
    fontSize: 18,
    marginBottom: 4,
  },
  tierLabel: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  tierLabelActive: {
    color: '#9c7a4e',
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

import { useCallback, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import { formatMinor } from '@worn/shared';
import { useRouter } from 'expo-router';

import { Button } from '@/src/components/ui';
import { ClosetScreen } from '@/src/components/ClosetScreen';
import { ClosetVirtualList } from '@/src/components/ClosetVirtualList';
import { usePrompt } from '@/src/components/PromptSheet';
import { DeclutterProgressRing } from '@/src/components/DeclutterProgressRing';
import { ReplaceTwinSheet } from '@/src/components/ReplaceTwinSheet';
import {
  useCreateDisposition,
  useDisposition,
  useDisposeWaste,
  useLogWear,
  useStartDeclutterChallenge,
  useStartWearChallenge,
  useWardrobe,
  useWasteDead,
  useWasteSummary,
} from '@/src/hooks/closet/useCloset';
import { wasteRestyleCta } from '@/src/lib/bridgeWow';
import { useClosetPrefsStore } from '@/src/lib/closetPrefs';
import { CLOSET_OFF_SUBTITLE, closetAlertText } from '@/src/lib/closetScreenState';
import { FEATURE_CLOSET } from '@/src/lib/features';
import { buildNeverWornShareFromMetrics, neverWornCostMinor, shareNeverWornCard } from '@/src/lib/wasteMoney';
import {
  buildDeclutterShareCard,
  countDisposedItems,
  declutterChallengeCelebrateCopy,
  declutterChallengeNudgeCopy,
  declutterChallengeProgress,
} from '@/src/lib/declutterChallenge';
import {
  wearChallengeCelebrateCopy,
  wearChallengeNudgeCopy,
  wearChallengeProgress,
} from '@/src/lib/wearChallenge';
import { trackEvent } from '@/src/lib/analytics';
import { useClosetStore } from '@/src/stores/closet';
import {
  accent,
  accentBg,
  border,
  fontMono,
  fontSans,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  fsMicro,
  radiusMd,
  space4,
  surface,
  text,
  textMuted,
} from '@/src/theme/tokens';

const FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'SELL', label: 'Sell' },
  { value: 'DONATE', label: 'Donate' },
  { value: 'BARTER', label: 'Barter' },
] as const;

const MODE_LABEL: Record<string, string> = { SELL: 'For sale', DONATE: 'To donate', BARTER: 'To swap' };
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Listed',
  SOLD: 'Sold',
  DONATED: 'Donated',
  BARTERED: 'Swapped',
  CANCELLED: 'Withdrawn',
};

export default function DispositionMarketplaceScreen() {
  const router = useRouter();
  const { data, isLoading, refetch } = useDisposition();
  const waste = useWasteSummary();
  const dead = useWasteDead();
  // Listings carry only the item id; the closet (usually already cached) names them.
  const wardrobe = useWardrobe();
  const create = useCreateDisposition();
  const dispose = useDisposeWaste();
  const challenge = useStartWearChallenge();
  const declutter = useStartDeclutterChallenge();
  const wear = useLogWear();
  const wearChallengeIds = useClosetStore((s) => s.wearChallengeIds);
  const declutterStarted = useClosetStore((s) => s.declutterChallengeStarted);
  const [filter, setFilter] = useState<'ALL' | 'SELL' | 'DONATE' | 'BARTER'>('ALL');
  const [sharing, setSharing] = useState(false);
  const [sharingDeclutter, setSharingDeclutter] = useState(false);
  const currency = useClosetPrefsStore((s) => s.preferredCurrency);
  const { ask, promptElement } = usePrompt();

  const refetchWaste = waste.refetch;
  const refetchDead = dead.refetch;
  const onRefresh = useCallback(async () => {
    await Promise.all([refetch(), refetchWaste(), refetchDead()]);
  }, [refetch, refetchWaste, refetchDead]);

  if (!FEATURE_CLOSET) {
    return (
      <ClosetScreen
        title="Marketplace"
        subtitle={CLOSET_OFF_SUBTITLE}
      />
    );
  }

  const listings = data?.listings ?? [];
  const filtered = filter === 'ALL' ? listings : listings.filter((l) => l.mode === filter);
  const deadItems = dead.data?.items ?? [];
  const pieceName = (it: { brand?: string | null; category?: string | null } | undefined) =>
    `${it?.brand ? `${it.brand} · ` : ''}${it?.category ?? 'Unnamed piece'}`;
  const itemNames = new Map<string, string>([
    ...(wardrobe.data?.items ?? []).map((it) => [it.id, pieceName(it)] as const),
    ...deadItems.map((m) => [m.wardrobeItemId, pieceName(m.item)] as const),
  ]);
  const metrics = waste.data?.metrics ?? deadItems;
  const neverWorn =
    waste.data?.neverWornCostMinor ?? neverWornCostMinor(metrics);
  const shareCard =
    waste.data?.shareCard ??
    buildNeverWornShareFromMetrics(metrics, { neverWornCostMinor: neverWorn });

  const declutterChallenge =
    data?.declutterChallenge ??
    waste.data?.declutterChallenge ??
    declutterChallengeProgress(countDisposedItems(listings), {
      started: declutterStarted,
    });
  const declutterShare =
    data?.declutterShareCard ??
    waste.data?.declutterShareCard ??
    buildDeclutterShareCard({
      progress: declutterChallenge.progress,
      target: declutterChallenge.target,
      modes: listings.map((l) => l.mode),
    });

  // Listing is the step that puts a piece in front of buyers or a charity: ask first, on every platform.
  async function disposeDead(m: (typeof deadItems)[number], mode: 'SELL' | 'DONATE') {
    const name = itemNames.get(m.wardrobeItemId) ?? 'this piece';
    const ok = await ask({
      title: mode === 'SELL' ? 'Sell this piece?' : 'Donate this piece?',
      message:
        mode === 'SELL'
          ? `${name} goes up for resale. You can withdraw it from this screen.`
          : `${name} is marked for donation. You can withdraw it from this screen.`,
      fields: [],
      confirmLabel: mode === 'SELL' ? 'List for sale' : 'Donate',
    });
    if (!ok) return;
    dispose.mutate(
      { itemId: m.wardrobeItemId, mode },
      {
        onSuccess: () => {
          const next = declutterChallengeProgress(
            countDisposedItems([...listings, { wardrobeItemId: m.wardrobeItemId, mode, status: 'ACTIVE' }]),
            { started: declutterStarted || declutterChallenge.started },
          );
          if (next.completed) {
            Alert.alert('Declutter complete', declutterChallengeCelebrateCopy(next.target));
            useClosetStore.getState().completeDeclutterChallenge();
            trackEvent('declutter_challenge_completed' as never);
          } else {
            Alert.alert(mode === 'SELL' ? 'Listed' : 'Marked for donation', mode === 'SELL' ? 'Ready for buyers.' : name);
          }
        },
        onError: (e) => Alert.alert(mode === 'SELL' ? 'Could not list it' : 'Could not mark it', closetAlertText(e)),
      },
    );
  }

  async function shareNeverWornCardAction() {
    setSharing(true);
    try {
      await shareNeverWornCard(shareCard);
      trackEvent('waste_share_card' as never);
    } catch (e) {
      Alert.alert('Share failed', closetAlertText(e));
    } finally {
      setSharing(false);
    }
  }

  async function shareDeclutterCard() {
    setSharingDeclutter(true);
    try {
      await Share.share({
        message: declutterShare.shareText,
        title: declutterShare.headline,
      });
      trackEvent('declutter_share_card' as never);
      if (declutterChallenge.completed) {
        useClosetStore.getState().completeDeclutterChallenge();
        trackEvent('declutter_challenge_completed' as never);
      }
    } catch (e) {
      Alert.alert('Share failed', closetAlertText(e));
    } finally {
      setSharingDeclutter(false);
    }
  }

  return (
    <ClosetScreen
      title="Waste & disposition"
      subtitle="Clothes you never wear — sell, donate, or barter in one tap."
      onRefresh={onRefresh}
      onRetry={() => void onRefresh()}
    >
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Never worn</Text>
        <Text style={styles.heroValue}>{shareCard.amountLabel}</Text>
        <Text style={styles.muted}>
          {deadItems.length > 0
            ? `${deadItems.length} piece${deadItems.length === 1 ? '' : 's'} ready to clear.`
            : 'Log wears and we’ll flag dead inventory here.'}
        </Text>
        {shareCard.blurredMerchants.length > 0 ? (
          <Text style={styles.blurLine}>{shareCard.blurredMerchants.join(' · ')}</Text>
        ) : null}
        <Text style={styles.watermark}>{shareCard.watermark}</Text>
        <View style={[styles.row, { marginTop: space4 }]}>
          <Button
            label={sharing ? 'Sharing…' : 'Share card'}
            size="sm"
            variant="primary"
            disabled={sharing || neverWorn <= 0}
            onPress={shareNeverWornCardAction}
          />
          <Button
            label="Swap circle"
            size="sm"
            variant="secondary"
            onPress={() => router.push('/(closet)/swap' as never)}
          />
        </View>
      </View>

      <View style={styles.banner}>
        <Text style={styles.title}>Declutter challenge</Text>
        <Text style={styles.challenge}>
          {declutterChallengeNudgeCopy({
            ...declutterChallenge,
            started: declutterChallenge.started || declutterStarted,
          })}
        </Text>
        {declutterShare.modeLine ? (
          <Text style={styles.muted}>{declutterShare.modeLine}</Text>
        ) : null}
        {(declutterStarted ||
          declutterChallenge.started ||
          declutterChallenge.progress > 0 ||
          declutterChallenge.completed) && (
          <DeclutterProgressRing
            progress={declutterChallenge.progress}
            target={declutterChallenge.target}
            completed={declutterChallenge.completed}
            sharing={sharingDeclutter}
            onShare={() => void shareDeclutterCard()}
          />
        )}
        <View style={[styles.row, { marginTop: space4 }]}>
          {!declutterStarted && declutterChallenge.eligible ? (
            <Button
              label={`Clear ${declutterChallenge.target}`}
              size="sm"
              variant="primary"
              disabled={declutter.isPending}
              onPress={() =>
                declutter.mutate(undefined, {
                  onSuccess: (res) =>
                    Alert.alert('Challenge on', declutterChallengeNudgeCopy(res.declutterChallenge)),
                  onError: (e) => Alert.alert('Failed', closetAlertText(e)),
                })
              }
            />
          ) : null}
          {(declutterStarted || declutterChallenge.started || declutterChallenge.progress > 0) &&
          !declutterChallenge.completed ? (
            <Button
              label={sharingDeclutter ? 'Sharing…' : 'Share progress'}
              size="sm"
              variant="secondary"
              disabled={sharingDeclutter}
              onPress={() => void shareDeclutterCard()}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Show listings">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            label={f.label}
            size="sm"
            variant={filter === f.value ? 'primary' : 'secondary'}
            accessibilityRole="radio"
            accessibilityState={{ selected: filter === f.value }}
            onPress={() => setFilter(f.value)}
          />
        ))}
      </View>

      {deadItems.length > 0 ? (
        <View style={styles.banner}>
          <Text style={styles.title}>Clear dead inventory</Text>
          <Text style={styles.muted}>Wear it 3× first — or list in one tap.</Text>
          <View>
            {deadItems.slice(0, 5).map((m) => {
              const started = wearChallengeIds.includes(m.wardrobeItemId);
              const progress = wearChallengeProgress(m.wearCount, m.status, { started });
              const label = m.item?.brand || m.item?.category || null;
              return (
                <View key={m.wardrobeItemId} style={styles.card}>
                  <Text style={styles.title}>{itemNames.get(m.wardrobeItemId)}</Text>
                  <Text style={styles.muted}>
                    {m.item?.costMinor ? `${formatMinor(m.item.costMinor, currency)} · ` : ''}
                    {m.wearCount === 0 ? 'never worn' : `worn ${m.wearCount}×`}
                    {m.costPerWearMinor != null
                      ? ` · ${formatMinor(m.costPerWearMinor, currency)}/wear`
                      : ''}
                  </Text>
                  {progress.eligible || started ? (
                    <Text style={styles.challenge}>{wearChallengeNudgeCopy(progress, label)}</Text>
                  ) : null}
                  <View style={styles.row}>
                    <ReplaceTwinSheet wardrobeItemId={m.wardrobeItemId} label={label} />
                    <Button
                      label={wasteRestyleCta().label}
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        const cta = wasteRestyleCta();
                        trackEvent('waste_restyle_cta' as never, {
                          wardrobeItemId: m.wardrobeItemId,
                        });
                        router.push(cta.href as never);
                      }}
                    />
                    {!started && progress.eligible ? (
                      <Button
                        label="Wear it 3×"
                        size="sm"
                        variant="secondary"
                        disabled={challenge.isPending}
                        onPress={() =>
                          challenge.mutate(m.wardrobeItemId, {
                            onSuccess: () =>
                              Alert.alert('Challenge on', wearChallengeNudgeCopy(progress, label)),
                            onError: (e) => Alert.alert('Failed', closetAlertText(e)),
                          })
                        }
                      />
                    ) : null}
                    {started && !progress.completed ? (
                      <Button
                        label={`Log wear (${progress.label})`}
                        size="sm"
                        variant="secondary"
                        disabled={wear.isPending}
                        onPress={() =>
                          wear.mutate(
                            {
                              wardrobeItemId: m.wardrobeItemId,
                              priorWearCount: m.wearCount,
                            },
                            {
                              onSuccess: () => {
                                const next = wearChallengeProgress(m.wearCount + 1, m.status, {
                                  started: true,
                                });
                                if (next.completed) {
                                  Alert.alert('Challenge complete', wearChallengeCelebrateCopy(label));
                                }
                              },
                              onError: (e) => Alert.alert('Failed', closetAlertText(e)),
                            },
                          )
                        }
                      />
                    ) : null}
                    <Button
                      label="Sell"
                      size="sm"
                      variant="primary"
                      disabled={dispose.isPending || create.isPending}
                      onPress={() => void disposeDead(m, 'SELL')}
                    />
                    <Button
                      label="Donate"
                      size="sm"
                      variant="ghost"
                      disabled={dispose.isPending}
                      onPress={() => void disposeDead(m, 'DONATE')}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={{ marginTop: space4 }}>
        {isLoading ? <Text style={styles.muted}>Loading…</Text> : null}
        <ClosetVirtualList
          data={filtered}
          keyExtractor={(l) => l.id}
          testID="disposition-listings"
          ListEmptyComponent={
            !isLoading ? (
              <Text style={styles.muted}>No listings yet. Dispose a dead item above.</Text>
            ) : null
          }
          renderItem={({ item: l }) => (
            <View style={styles.card}>
              <Text style={styles.title}>
                {MODE_LABEL[l.mode] ?? l.mode.toLowerCase()} · {STATUS_LABEL[l.status] ?? l.status.toLowerCase()}
              </Text>
              <Text style={styles.muted}>
                {itemNames.get(l.wardrobeItemId) ?? 'A piece from your closet'}
                {l.priceMinor != null ? ` · ${formatMinor(l.priceMinor, currency)}` : ''}
              </Text>
            </View>
          )}
        />
      </View>
      {promptElement}
    </ClosetScreen>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    marginBottom: space4,
    marginTop: space4,
    padding: space4,
  },
  blurLine: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    letterSpacing: 1.2,
    marginTop: 8,
    opacity: 0.85,
  },
  card: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    marginBottom: space4,
    marginTop: space4,
    padding: space4,
  },
  challenge: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsCaption,
    marginTop: 6,
  },
  hero: {
    backgroundColor: accentBg,
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    marginBottom: space4,
    padding: space4,
  },
  // The site's eyebrow: DM Mono, uppercase, wide tracking.
  heroLabel: {
    color: accent,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: fsMicro * 0.2,
    textTransform: 'uppercase',
  },
  heroValue: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: 32,
    marginTop: 4,
  },
  muted: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption, lineHeight: 18, marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space4 },
  title: { color: text, fontFamily: fontSansSemiBold, fontSize: fsBody },
  watermark: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsMicro,
    marginTop: 6,
  },
});

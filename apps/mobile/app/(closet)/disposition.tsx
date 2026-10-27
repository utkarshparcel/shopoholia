import { useCallback, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { formatMinor } from '@worn/shared';
import { useRouter } from 'expo-router';

import { Button } from '@/src/components/ui';
import { ClosetScreen } from '@/src/components/ClosetScreen';
import { ClosetVirtualList } from '@/src/components/ClosetVirtualList';
import { DeclutterProgressRing } from '@/src/components/DeclutterProgressRing';
import { ReplaceTwinSheet } from '@/src/components/ReplaceTwinSheet';
import {
  useCreateDisposition,
  useDisposition,
  useDisposeWaste,
  useLogWear,
  useStartDeclutterChallenge,
  useStartWearChallenge,
  useWasteDead,
  useWasteSummary,
} from '@/src/hooks/closet/useCloset';
import { wasteRestyleCta } from '@/src/lib/bridgeWow';
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
  accentBg,
  border,
  fontSans,
  fsBody,
  fsCaption,
  radiusMd,
  space4,
  surface,
  text,
  textMuted,
} from '@/src/theme/tokens';

export default function DispositionMarketplaceScreen() {
  const router = useRouter();
  const { data, isLoading, refetch } = useDisposition();
  const waste = useWasteSummary();
  const dead = useWasteDead();
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

  const onRefresh = useCallback(async () => {
    await Promise.all([refetch(), waste.refetch(), dead.refetch()]);
  }, [refetch, waste, dead]);

  if (!FEATURE_CLOSET) {
    return (
      <ClosetScreen
        title="Marketplace"
        subtitle="Enable EXPO_PUBLIC_FEATURE_CLOSET=1 to view disposition market."
      />
    );
  }

  const listings = data?.listings ?? [];
  const filtered = filter === 'ALL' ? listings : listings.filter((l) => l.mode === filter);
  const deadItems = dead.data?.items ?? [];
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

  async function shareNeverWornCardAction() {
    setSharing(true);
    try {
      await shareNeverWornCard(shareCard);
      trackEvent('waste_share_card' as never);
    } catch (e) {
      Alert.alert('Share failed', (e as Error).message);
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
      Alert.alert('Share failed', (e as Error).message);
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
                  onError: (e) => Alert.alert('Failed', (e as Error).message),
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

      <View style={styles.row}>
        {(['ALL', 'SELL', 'DONATE', 'BARTER'] as const).map((k) => (
          <Button
            key={k}
            label={k}
            size="sm"
            variant={filter === k ? 'primary' : 'secondary'}
            onPress={() => setFilter(k)}
          />
        ))}
      </View>

      {deadItems.length > 0 ? (
        <View style={styles.banner}>
          <Text style={styles.title}>Clear dead inventory</Text>
          <Text style={styles.muted}>Wear it 3× first — or list in one tap.</Text>
          <ScrollView>
            {deadItems.slice(0, 5).map((m) => {
              const started = wearChallengeIds.includes(m.wardrobeItemId);
              const progress = wearChallengeProgress(m.wearCount, m.status, { started });
              const label = m.item?.brand || m.item?.category || null;
              return (
                <View key={m.wardrobeItemId} style={styles.card}>
                  <Text style={styles.title}>
                    {m.item?.brand ? `${m.item.brand} · ` : ''}
                    {m.item?.category ?? m.wardrobeItemId.slice(0, 8)}
                  </Text>
                  <Text style={styles.muted}>
                    {m.item?.costMinor != null ? formatMinor(m.item.costMinor) : '—'} · worn{' '}
                    {m.wearCount}×
                    {m.costPerWearMinor != null
                      ? ` · ${formatMinor(m.costPerWearMinor)}/wear`
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
                            onError: (e) => Alert.alert('Failed', (e as Error).message),
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
                              onError: (e) => Alert.alert('Failed', (e as Error).message),
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
                      onPress={() =>
                        dispose.mutate(
                          { itemId: m.wardrobeItemId, mode: 'SELL' },
                          {
                            onSuccess: () => {
                              const next = declutterChallengeProgress(
                                countDisposedItems([
                                  ...listings,
                                  {
                                    wardrobeItemId: m.wardrobeItemId,
                                    mode: 'SELL',
                                    status: 'ACTIVE',
                                  },
                                ]),
                                { started: declutterStarted || declutterChallenge.started },
                              );
                              if (next.completed) {
                                Alert.alert(
                                  'Declutter complete',
                                  declutterChallengeCelebrateCopy(next.target),
                                );
                                useClosetStore.getState().completeDeclutterChallenge();
                                trackEvent('declutter_challenge_completed' as never);
                              } else {
                                Alert.alert('Listed', 'Ready for buyers.');
                              }
                            },
                            onError: (e) => Alert.alert('Failed', (e as Error).message),
                          },
                        )
                      }
                    />
                    <Button
                      label="Donate"
                      size="sm"
                      variant="ghost"
                      disabled={dispose.isPending}
                      onPress={() =>
                        dispose.mutate(
                          { itemId: m.wardrobeItemId, mode: 'DONATE' },
                          {
                            onSuccess: () => {
                              const next = declutterChallengeProgress(
                                countDisposedItems([
                                  ...listings,
                                  {
                                    wardrobeItemId: m.wardrobeItemId,
                                    mode: 'DONATE',
                                    status: 'ACTIVE',
                                  },
                                ]),
                                { started: declutterStarted || declutterChallenge.started },
                              );
                              if (next.completed) {
                                Alert.alert(
                                  'Declutter complete',
                                  declutterChallengeCelebrateCopy(next.target),
                                );
                                useClosetStore.getState().completeDeclutterChallenge();
                                trackEvent('declutter_challenge_completed' as never);
                              }
                            },
                            onError: (e) => Alert.alert('Failed', (e as Error).message),
                          },
                        )
                      }
                    />
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <View style={{ marginTop: space4 }}>
        {isLoading ? <Text style={styles.muted}>Loading…</Text> : null}
        <ClosetVirtualList
          data={filtered}
          keyExtractor={(l) => l.id}
          estimatedItemSize={88}
          testID="disposition-listings"
          ListEmptyComponent={
            !isLoading ? (
              <Text style={styles.muted}>No listings yet. Dispose a dead item above.</Text>
            ) : null
          }
          renderItem={({ item: l }) => (
            <View style={styles.card}>
              <Text style={styles.title}>
                {l.mode} · {l.status}
              </Text>
              <Text style={styles.muted}>
                Item {l.wardrobeItemId.slice(0, 8)}
                {l.priceMinor != null ? ` · ${formatMinor(l.priceMinor)}` : ''}
              </Text>
            </View>
          )}
        />
      </View>
    </ClosetScreen>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#f6fff6',
    borderColor: '#b6e1b6',
    borderRadius: radiusMd,
    borderWidth: 1,
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
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '600',
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
  heroLabel: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  heroValue: {
    color: text,
    fontFamily: fontSans,
    fontSize: 32,
    fontWeight: '700',
    marginTop: 4,
  },
  muted: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption, lineHeight: 18, marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space4 },
  title: { color: text, fontFamily: fontSans, fontSize: fsBody, fontWeight: '600' },
  watermark: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: 11,
    marginTop: 6,
    opacity: 0.55,
  },
});

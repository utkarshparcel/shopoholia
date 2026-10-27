import { useCallback, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  buildLentOverdueBanner,
  bulkImportCanCancel,
  bulkImportProgressLabel,
  canDeleteClosetProfile,
  formatMinor,
  inferWardrobeAutoTag,
  INITIAL_BULK_IMPORT_PROGRESS,
  profileDeleteConfirmCopy,
  reduceBulkImportProgress,
  type AutotagConfirmDraft,
  type BulkImportProgressState,
} from '@worn/shared';
import { Button } from '@/src/components/ui';
import { AutotagConfirmSheet } from '@/src/components/AutotagConfirmSheet';
import { CachedClosetImage } from '@/src/components/CachedClosetImage';
import { CareLabelBadge } from '@/src/components/CareLabelBadge';
import { ClosetScreen } from '@/src/components/ClosetScreen';
import { ClosetVirtualList } from '@/src/components/ClosetVirtualList';
import { CompleteLookSheet } from '@/src/components/CompleteLookSheet';
import { formatClosetDate } from '@/src/lib/format';
import { formatNeverWornAmount } from '@/src/lib/wasteMoney';
import { delightHapticSeasonalSwap } from '@/src/lib/delightHaptics';
import { seasonalSwapFeedback } from '@/src/lib/todayOccasionWow';
import {
  useBulkUploadWardrobe,
  useCapsule,
  useDeleteClosetProfile,
  useDisposeWaste,
  useImportablePurchases,
  useIngestionStatus,
  useLogWear,
  useSaveCapsule,
  useSetCpwGoal,
  useStartWearChallenge,
  useSeasonalSwap,
  useUpdateWardrobeItem,
  useCareOcrWardrobeItem,
  useDryCleanConfirm,
  useDryCleanDropOff,
  useLendWardrobeItem,
  useLentWardrobe,
  useReturnLentWardrobeItem,
  useClosetProfiles,
  useCreateClosetProfile,
  useWardrobe,
  useWardrobeFromPurchases,
  useWardrobeTryon,
  useUploadWardrobeItem,
  useWasteSummary,
} from '@/src/hooks/closet/useCloset';
import type { WardrobeItem } from '@/src/api/client';
import { emptyCtaTapProps, emptyStateCopy } from '@/src/lib/emptyDemo';
import { useClosetPrefsStore } from '@/src/lib/closetPrefs';
import { trackEvent } from '@/src/lib/analytics';
import { FEATURE_CLOSET } from '@/src/lib/features';
import {
  wearChallengeCelebrateCopy,
  wearChallengeNudgeCopy,
  wearChallengeProgress,
} from '@/src/lib/wearChallenge';
import { cpwGoalCelebrateCopy, cpwGoalNudgeCopy, cpwGoalProgress } from '@/src/lib/cpwGoals';
import { createAccessoryCategory, isAccessoryCategory } from '@/src/lib/accessories';
import { ShoeBagRotationNudge } from '@/src/components/ShoeBagRotationNudge';
import { MissingPieceShopSheet } from '@/src/components/MissingPieceShopSheet';
import { PhotoDumpReview } from '@/src/components/PhotoDumpReview';
import { useClosetStore } from '@/src/stores/closet';
import { closet, fontSans, fsBody, fsCaption, radiusMd, space4 } from '@/src/theme/tokens';

function laundryLabel(status: WardrobeItem['laundryStatus'] | undefined) {
  switch (status) {
    case 'DIRTY':
      return 'Dirty';
    case 'IN_LAUNDRY':
      return 'In laundry';
    default:
      return 'Clean';
  }
}

function closetLabel(status: WardrobeItem['closetStatus'] | undefined) {
  return status === 'STORED' ? 'Stored' : 'Active';
}

export default function ClosetWardrobeScreen() {
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const profiles = useClosetProfiles();
  const createProfile = useCreateClosetProfile();
  const deleteProfile = useDeleteClosetProfile();
  const lentOverdue = useLentWardrobe('overdue');
  const { data, isLoading, isError, error, refetch, isRefetching } = useWardrobe(activeProfileId);
  const waste = useWasteSummary();
  const upload = useUploadWardrobeItem();
  const bulkUpload = useBulkUploadWardrobe();
  const fromPurchases = useWardrobeFromPurchases();
  const importable = useImportablePurchases();
  const tryon = useWardrobeTryon();
  const wear = useLogWear();
  const dispose = useDisposeWaste();
  const challenge = useStartWearChallenge();
  const setCpw = useSetCpwGoal();
  const updateItem = useUpdateWardrobeItem();
  const careOcr = useCareOcrWardrobeItem();
  const dryCleanDrop = useDryCleanDropOff();
  const dryCleanDone = useDryCleanConfirm();
  const lendItem = useLendWardrobeItem();
  const returnLent = useReturnLentWardrobeItem();
  const seasonalSwap = useSeasonalSwap();
  const capsule = useCapsule();
  const saveCapsuleMut = useSaveCapsule();
  const wearChallengeIds = useClosetStore((s) => s.wearChallengeIds);
  const seedDemoGiftCard = useClosetStore((s) => s.seedDemoGiftCard);
  const markJustConnected = useClosetStore((s) => s.markJustConnected);
  const capsuleIds = new Set(capsule.data?.itemIds ?? []);

  const [category, setCategory] = useState('shirt');
  const [brand, setBrand] = useState('');
  const [cost, setCost] = useState('');
  const [previewMap, setPreviewMap] = useState<Record<string, string>>({});
  const [bulkProgress, setBulkProgress] = useState<BulkImportProgressState>(INITIAL_BULK_IMPORT_PROGRESS);
  const cancelBulkRef = useRef(false);
  const [autotagDrafts, setAutotagDrafts] = useState<AutotagConfirmDraft[]>([]);
  const [showAutotag, setShowAutotag] = useState(false);
  const [showCompleteLook, setShowCompleteLook] = useState(false);
  const router = useRouter();
  const ingestion = useIngestionStatus();
  const overdueBanner = buildLentOverdueBanner(lentOverdue.data?.items ?? [], new Date().toISOString().slice(0, 10));
  const swapPulse = useRef(new Animated.Value(1)).current;

  if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }

  const onRefresh = useCallback(() => {
    void Promise.all([
      refetch(),
      waste.refetch(),
      ingestion.refetch(),
      importable.refetch(),
      capsule.refetch(),
    ]);
  }, [refetch, waste, ingestion, importable, capsule]);

  if (!FEATURE_CLOSET) {
    return (
      <ClosetScreen title="Wardrobe" subtitle="Enable EXPO_PUBLIC_FEATURE_CLOSET=1 to view your wardrobe." />
    );
  }

  async function pickAndAdd() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 20,
    });
    if (result.canceled || !result.assets?.length) return;
    const uris = result.assets.map((a) => a.uri).filter(Boolean);
    const fallbackMeta = {
      category: isAccessoryCategory(category)
        ? createAccessoryCategory(category)
        : category.trim() || 'other',
      brand: brand || null,
      costMinor: Math.round(Number(cost) * 100) || 0,
    };
    if (uris.length === 1) {
      upload.mutate(
        { imageUri: uris[0]!, meta: fallbackMeta },
        { onError: (e) => Alert.alert('Could not add item', (e as Error).message) },
      );
      return;
    }
    // W060 — autotag confirm/edit before save
    const drafts: AutotagConfirmDraft[] = uris.map((uri) => {
      const tagged = inferWardrobeAutoTag({ imageKey: uri, text: category || brand || null });
      return {
        imageUri: uri,
        category: tagged.category || fallbackMeta.category,
        colors: tagged.colors.length ? tagged.colors : [],
        brand: tagged.brand ?? fallbackMeta.brand,
        confidence: tagged.confidence,
        duplicateWarnings: [],
      };
    });
    setAutotagDrafts(drafts);
    setShowAutotag(true);
  }

  function runBulkImport(drafts: AutotagConfirmDraft[]) {
    cancelBulkRef.current = false;
    setBulkProgress(reduceBulkImportProgress(INITIAL_BULK_IMPORT_PROGRESS, { type: 'start', total: drafts.length }));
    const costMinor = Math.round(Number(cost) * 100) || 0;
    bulkUpload.mutate(
      {
        imageUris: drafts.map((d) => d.imageUri),
        meta: {
          category: drafts[0]?.category ?? 'other',
          brand: drafts[0]?.brand ?? null,
          costMinor,
        },
        perItemMeta: drafts.map((d) => ({
          category: d.category,
          colors: d.colors,
          brand: d.brand,
          costMinor,
        })),
        shouldCancel: () => cancelBulkRef.current,
        onProgress: (p) => {
          setBulkProgress((prev) =>
            reduceBulkImportProgress(
              prev,
              p.ok
                ? { type: 'item_ok', index: p.index }
                : { type: 'item_fail', index: p.index, message: p.error ?? 'Upload failed' },
            ),
          );
        },
      },
      {
        onSuccess: (res) => {
          setBulkProgress((prev) => reduceBulkImportProgress(prev, { type: 'finish' }));
          const errN = res.errors?.length ?? 0;
          Alert.alert(
            res.cancelled ? 'Import cancelled' : 'Imported',
            `Added ${res.created}${errN ? ` · ${errN} failed` : ''}.`,
          );
        },
        onError: (e) => {
          setBulkProgress((prev) => ({
            ...prev,
            phase: 'done',
            errors: [...prev.errors, { index: prev.completed, message: (e as Error).message }],
          }));
          Alert.alert('Could not bulk import', (e as Error).message);
        },
      },
    );
  }

  async function doTryon(id: string) {
    const res = await tryon.mutateAsync(id);
    if (res.previewUrl) setPreviewMap((m) => ({ ...m, [id]: res.previewUrl! }));
  }

  function toggleLaundry(item: WardrobeItem) {
    const next: WardrobeItem['laundryStatus'] =
      item.laundryStatus === 'CLEAN' || !item.laundryStatus ? 'DIRTY' : 'CLEAN';
    updateItem.mutate(
      { id: item.id, patch: { laundryStatus: next } },
      { onError: (e) => Alert.alert('Could not update laundry', (e as Error).message) },
    );
  }

  function toggleCloset(item: WardrobeItem) {
    const next: NonNullable<WardrobeItem['closetStatus']> =
      item.closetStatus === 'STORED' ? 'ACTIVE' : 'STORED';
    updateItem.mutate(
      { id: item.id, patch: { closetStatus: next } },
      { onError: (e) => Alert.alert('Could not update closet', (e as Error).message) },
    );
  }

  function runSeasonalSwap(season: 'summer' | 'winter' | 'monsoon') {
    seasonalSwap.mutate(
      { season },
      {
        onSuccess: (res) => {
          void (async () => {
            const reduce = await AccessibilityInfo.isReduceMotionEnabled();
            const feedback = seasonalSwapFeedback(reduce);
            if (feedback.haptic) void delightHapticSeasonalSwap();
            if (feedback.animate) {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              swapPulse.setValue(0.92);
              Animated.spring(swapPulse, {
                toValue: 1,
                friction: 5,
                useNativeDriver: true,
              }).start();
            }
          })();
          Alert.alert(
            'Seasonal swap',
            `${season}: ${res.active} active · ${res.stored} stored. Today prefers active pieces.`,
          );
        },
        onError: (e) => Alert.alert('Could not swap season', (e as Error).message),
      },
    );
  }

  async function snapCareTag(item: WardrobeItem) {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    const result =
      cam.status === 'granted'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.85,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.85,
          });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    careOcr.mutate(
      { id: item.id, imageUri: result.assets[0].uri },
      {
        onSuccess: (res) => {
          const r = res.careRules;
          Alert.alert(
            'Care label saved',
            `Wash ${r.wash} · Dry ${r.dry} · Iron ${r.iron} · Dry-clean ${r.dryClean}`,
          );
        },
        onError: (e) => Alert.alert('Could not read care tag', (e as Error).message),
      },
    );
  }

  function sendToDryClean(item: WardrobeItem) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const defaultPickup = tomorrow.toISOString().slice(0, 10);

    const submit = (ticket: string, pickupOn: string) => {
      const t = ticket.trim();
      const p = pickupOn.trim();
      if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(p)) {
        Alert.alert('Need ticket + pickup date (YYYY-MM-DD)');
        return;
      }
      dryCleanDrop.mutate(
        { id: item.id, ticket: t, pickupOn: p },
        {
          onSuccess: () =>
            Alert.alert('At the cleaner', `Ticket ${t} · pickup ${p}. We’ll nudge you that morning.`),
          onError: (e) => Alert.alert('Could not log dry clean', (e as Error).message),
        },
      );
    };

    if (typeof Alert.prompt === 'function') {
      Alert.prompt('Dry-clean ticket', 'Ticket number from the cleaner', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Next',
          onPress: (ticket?: string) => {
            Alert.prompt?.(
              'Pickup date',
              'YYYY-MM-DD',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Send',
                  onPress: (pickupOn?: string) => submit(ticket ?? '', pickupOn ?? defaultPickup),
                },
              ],
              'plain-text',
              defaultPickup,
            );
          },
        },
      ]);
      return;
    }
    submit(`DC-${item.category.slice(0, 4).toUpperCase()}`, defaultPickup);
  }

  function confirmDryCleanPickup(item: WardrobeItem) {
    dryCleanDone.mutate(item.id, {
      onSuccess: () => Alert.alert('Back in closet', 'Marked clean — ready to wear.'),
      onError: (e) => Alert.alert('Could not confirm pickup', (e as Error).message),
    });
  }

  const items = data?.items ?? [];
  const hasContent = items.length > 0;
  const isEmpty = !isLoading && !isError && items.length === 0;
  const metrics = waste.data?.metrics ?? [];
  const deadIds = new Set(metrics.filter((m) => m.status === 'DEAD').map((m) => m.wardrobeItemId));
  const cleanItems = items.filter((i) => (i.laundryStatus ?? 'CLEAN') === 'CLEAN');
  const laundryBasket = items.filter((i) => {
    const s = i.laundryStatus ?? 'CLEAN';
    return s === 'DIRTY' || s === 'IN_LAUNDRY';
  });

  const pendingPurchases = (importable.data?.items ?? []).filter((i) => !i.alreadyInWardrobe);

  const addForm = (
    <View style={styles.form}>
      <TextInput
        style={styles.input}
        placeholder="Category (shirt, jewelry, bag…)"
        placeholderTextColor={closet.muted}
        value={category}
        onChangeText={setCategory}
      />
      <TextInput
        style={styles.input}
        placeholder="Brand (optional)"
        placeholderTextColor={closet.muted}
        value={brand}
        onChangeText={setBrand}
      />
      <TextInput
        style={styles.input}
        placeholder="Cost ₹ (optional)"
        placeholderTextColor={closet.muted}
        keyboardType="decimal-pad"
        value={cost}
        onChangeText={setCost}
      />
      <Button
        label={
          upload.isPending || bulkUpload.isPending
            ? `Uploading ${bulkImportProgressLabel(bulkProgress)}…`
            : 'Add photos (multi-select)'
        }
        block
        disabled={upload.isPending || bulkUpload.isPending}
        onPress={pickAndAdd}
      />
      {bulkProgress.phase === 'running' || bulkProgress.phase === 'cancelled' || bulkProgress.errors.length > 0 ? (
        <View style={styles.importBox} testID="bulk-import-progress">
          <Text style={styles.muted}>
            Import {bulkImportProgressLabel(bulkProgress)}
            {bulkProgress.cancelled ? ' · cancelled' : ''}
          </Text>
          {bulkProgress.errors.slice(0, 3).map((err) => (
            <Text key={`err-${err.index}`} style={styles.muted}>
              · Photo {err.index + 1}: {err.message}
            </Text>
          ))}
          {bulkImportCanCancel(bulkProgress) ? (
            <Button
              label="Cancel import"
              size="sm"
              variant="ghost"
              onPress={() => {
                cancelBulkRef.current = true;
                setBulkProgress((prev) => reduceBulkImportProgress(prev, { type: 'cancel' }));
              }}
            />
          ) : null}
        </View>
      ) : null}
      <Button
        label="Complete look"
        size="sm"
        variant="secondary"
        onPress={() => setShowCompleteLook(true)}
      />
      <View style={styles.row}>
        <Animated.View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, transform: [{ scale: swapPulse }] }}>
          <Button
            label="Summer swap"
            size="sm"
            variant="ghost"
            disabled={seasonalSwap.isPending}
            onPress={() => runSeasonalSwap('summer')}
          />
          <Button
            label="Winter swap"
            size="sm"
            variant="ghost"
            disabled={seasonalSwap.isPending}
            onPress={() => runSeasonalSwap('winter')}
          />
          <Button
            label="Monsoon"
            size="sm"
            variant="ghost"
            disabled={seasonalSwap.isPending}
            onPress={() => runSeasonalSwap('monsoon')}
          />
        </Animated.View>
      </View>
      {pendingPurchases.length > 0 ? (
        <View style={styles.importBox}>
          <Text style={styles.sectionTitle}>From inbox purchases</Text>
          <Text style={styles.muted}>
            {pendingPurchases.length} ingested item{pendingPurchases.length === 1 ? '' : 's'} ready
            to add.
          </Text>
          {pendingPurchases.slice(0, 5).map((p) => (
            <Text key={p.purchaseItemId} style={styles.muted}>
              · {p.title} · {p.merchant} · {formatMinor(p.priceMinor)}
            </Text>
          ))}
          <Button
            label={
              fromPurchases.isPending
                ? 'Adding…'
                : `Add ${pendingPurchases.length} to wardrobe`
            }
            size="sm"
            variant="secondary"
            disabled={fromPurchases.isPending}
            onPress={() =>
              fromPurchases.mutate(
                pendingPurchases.map((p) => p.purchaseItemId),
                {
                  onSuccess: (res) =>
                    Alert.alert('Imported', `Added ${res.created} from purchases.`),
                  onError: (e) => Alert.alert('Could not import', (e as Error).message),
                },
              )
            }
          />
        </View>
      ) : null}
    </View>
  );

  function renderItemCard(item: WardrobeItem) {
    const metric = metrics.find((m) => m.wardrobeItemId === item.id);
    const preview = previewMap[item.id] ?? item.garmentImageUrl ?? item.imageUrls?.[0];
    const isDirty = (item.laundryStatus ?? 'CLEAN') !== 'CLEAN';
    const started = wearChallengeIds.includes(item.id);
    const progress = wearChallengeProgress(metric?.wearCount ?? 0, metric?.status, { started });
    const label = item.brand || item.category;
    const showChallenge =
      started ||
      metric?.status === 'DEAD' ||
      metric?.status === 'DORMANT' ||
      (metric != null && metric.wearCount === 0);
    return (
      <View
        style={[styles.card, deadIds.has(item.id) ? styles.cardDead : null, isDirty ? styles.cardDirty : null]}
      >
        {preview ? <CachedClosetImage uri={preview} style={styles.thumb} /> : null}
        <Text style={styles.merchant}>
          {item.category} {item.brand ? `· ${item.brand}` : ''}
        </Text>
        <Text style={styles.muted}>
          {item.colors?.join(', ') || 'no colors'} · {formatMinor(item.costMinor)} ·{' '}
          {laundryLabel(item.laundryStatus)} · {closetLabel(item.closetStatus)}
          {item.dryCleanTicket ? ` · DC ${item.dryCleanTicket}` : ''}
          {item.dryCleanPickupOn ? ` · pickup ${formatClosetDate(item.dryCleanPickupOn)}` : ''}
          {item.lentTo ? ` · lent to ${item.lentTo}` : ''}
          {item.lentDueOn ? ` · due ${formatClosetDate(item.lentDueOn)}` : ''}
        </Text>
        <CareLabelBadge careRules={item.careRules} />
        {metric ? (
          <Text style={styles.muted}>
            Worn {metric.wearCount}× ·{' '}
            {metric.costPerWearMinor != null ? `${formatMinor(metric.costPerWearMinor)}/wear` : '—'} ·{' '}
            {metric.status}
          </Text>
        ) : null}
        {showChallenge && !progress.completed ? (
          <Text style={styles.challenge}>{wearChallengeNudgeCopy(progress, label)}</Text>
        ) : null}
        {progress.completed && started ? (
          <Text style={styles.challenge}>{wearChallengeCelebrateCopy(label)}</Text>
        ) : null}
        {(() => {
          const goal =
            metric?.cpwGoal ??
            cpwGoalProgress(item.costMinor, metric?.wearCount ?? 0, metric?.targetCpwMinor ?? null);
          if (!goal.active) return null;
          return (
            <Text style={styles.challenge}>
              {goal.completed ? cpwGoalCelebrateCopy(label) : cpwGoalNudgeCopy(goal, label)}
            </Text>
          );
        })()}
        <View style={styles.row}>
          <Button
            label="Try on"
            size="sm"
            variant="secondary"
            disabled={tryon.isPending}
            onPress={() => doTryon(item.id)}
          />
          <Button
            label="Wore it"
            size="sm"
            variant="ghost"
            disabled={wear.isPending}
            onPress={() =>
              wear.mutate(
                { wardrobeItemId: item.id, priorWearCount: metric?.wearCount ?? 0 },
                {
                  onSuccess: () => {
                    if (!started) return;
                    const next = wearChallengeProgress((metric?.wearCount ?? 0) + 1, metric?.status, {
                      started: true,
                    });
                    if (next.completed) {
                      Alert.alert('Challenge complete', wearChallengeCelebrateCopy(label));
                    }
                    const goalNext = cpwGoalProgress(
                      item.costMinor,
                      (metric?.wearCount ?? 0) + 1,
                      metric?.targetCpwMinor ?? metric?.cpwGoal?.targetCpwMinor ?? null,
                    );
                    if (goalNext.active && goalNext.completed) {
                      Alert.alert('CPW goal hit', cpwGoalCelebrateCopy(label));
                    }
                  },
                },
              )
            }
          />
          {showChallenge && !started && !progress.completed ? (
            <Button
              label="Wear it 3×"
              size="sm"
              variant="secondary"
              disabled={challenge.isPending}
              onPress={() =>
                challenge.mutate(item.id, {
                  onSuccess: () =>
                    Alert.alert('Challenge on', wearChallengeNudgeCopy(progress, label)),
                  onError: (e) => Alert.alert('Failed', (e as Error).message),
                })
              }
            />
          ) : null}
          <Button
            label={capsuleIds.has(item.id) ? 'In capsule' : 'Capsule'}
            size="sm"
            variant={capsuleIds.has(item.id) ? 'secondary' : 'ghost'}
            disabled={saveCapsuleMut.isPending}
            onPress={() => {
              const next = capsuleIds.has(item.id)
                ? [...capsuleIds].filter((id) => id !== item.id)
                : [...capsuleIds, item.id];
              saveCapsuleMut.mutate(next, {
                onError: (e) => Alert.alert('Capsule', (e as Error).message),
              });
            }}
          />
          {!(metric?.cpwGoal?.active || (metric?.targetCpwMinor != null && metric.targetCpwMinor > 0)) ? (
            <Button
              label="CPW goal"
              size="sm"
              variant="secondary"
              disabled={setCpw.isPending}
              onPress={() => {
                Alert.prompt?.(
                  'Cost-per-wear goal',
                  'Target ₹ per wear (e.g. 500)',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Set',
                      onPress: (value?: string) => {
                        const rupees = Number(value);
                        if (!Number.isFinite(rupees) || rupees <= 0) {
                          Alert.alert('Enter a valid amount');
                          return;
                        }
                        setCpw.mutate(
                          { itemId: item.id, targetCpwMinor: Math.round(rupees * 100) },
                          {
                            onSuccess: (data) =>
                              Alert.alert('Goal set', cpwGoalNudgeCopy(data.cpwGoal, label)),
                            onError: (e) => Alert.alert('Failed', (e as Error).message),
                          },
                        );
                      },
                    },
                  ],
                  'plain-text',
                  '',
                  'decimal-pad',
                );
                // Android fallback when Alert.prompt is unavailable
                if (typeof Alert.prompt !== 'function') {
                  const suggested = item.costMinor > 0 ? Math.max(1, Math.round(item.costMinor / 10 / 100)) : 500;
                  setCpw.mutate(
                    { itemId: item.id, targetCpwMinor: suggested * 100 },
                    {
                      onSuccess: (data) =>
                        Alert.alert('Goal set', cpwGoalNudgeCopy(data.cpwGoal, label)),
                      onError: (e) => Alert.alert('Failed', (e as Error).message),
                    },
                  );
                }
              }}
            />
          ) : null}
          <Button
            label={isDirty ? 'Mark clean' : 'Mark dirty'}
            size="sm"
            variant="ghost"
            disabled={updateItem.isPending}
            onPress={() => toggleLaundry(item)}
          />
          <Button
            label={item.careRules ? 'Re-scan care' : 'Snap care tag'}
            size="sm"
            variant="ghost"
            disabled={careOcr.isPending}
            onPress={() => void snapCareTag(item)}
          />
          {item.dryCleanTicket && item.laundryStatus === 'IN_LAUNDRY' ? (
            <Button
              label="Picked up"
              size="sm"
              variant="secondary"
              disabled={dryCleanDone.isPending}
              onPress={() => confirmDryCleanPickup(item)}
            />
          ) : (
            <Button
              label="Dry clean"
              size="sm"
              variant="ghost"
              disabled={dryCleanDrop.isPending}
              onPress={() => sendToDryClean(item)}
            />
          )}
          {item.lentTo ? (
            <Button
              label="Returned"
              size="sm"
              variant="secondary"
              disabled={returnLent.isPending}
              onPress={() =>
                returnLent.mutate(item.id, {
                  onError: (e) => Alert.alert('Could not mark returned', (e as Error).message),
                })
              }
            />
          ) : (
            <Button
              label="Lend"
              size="sm"
              variant="ghost"
              disabled={lendItem.isPending}
              onPress={() => {
                const due = new Date();
                due.setDate(due.getDate() + 7);
                const dueOn = due.toISOString().slice(0, 10);
                if (typeof Alert.prompt === 'function') {
                  Alert.prompt('Lend to', 'Who borrowed this?', (lentTo) => {
                    if (!lentTo?.trim()) return;
                    lendItem.mutate(
                      { id: item.id, lentTo: lentTo.trim(), dueOn },
                      {
                        onError: (e) => Alert.alert('Could not lend', (e as Error).message),
                      },
                    );
                  });
                } else {
                  lendItem.mutate(
                    { id: item.id, lentTo: 'Friend', dueOn },
                    {
                      onSuccess: () => Alert.alert('Lent', `Due ${dueOn}`),
                      onError: (e) => Alert.alert('Could not lend', (e as Error).message),
                    },
                  );
                }
              }}
            />
          )}
          <Button
            label={item.closetStatus === 'STORED' ? 'Activate' : 'Store'}
            size="sm"
            variant="ghost"
            disabled={updateItem.isPending}
            onPress={() => toggleCloset(item)}
          />
          {deadIds.has(item.id) ? (
            <Button
              label="Dispose"
              size="sm"
              variant="primary"
              onPress={() => dispose.mutate({ itemId: item.id, mode: 'SELL' })}
            />
          ) : null}
        </View>
      </View>
    );
  }

  const emptyCopyVariant = useClosetPrefsStore((s) => s.emptyCopyVariant);
  const wardrobeEmpty = emptyStateCopy('wardrobe', emptyCopyVariant);

  return (
    <ClosetScreen
      title="Wardrobe"
      subtitle="Every piece you own. Tap try-on to see it styled, log a wear, or clear dead inventory."
      loading={isLoading}
      loadingLabel="Loading your closet…"
      hasContent={hasContent}
      error={isError ? ((error as Error)?.message ?? true) : null}
      onRetry={() => refetch()}
      empty={isEmpty}
      emptyTitle={wardrobeEmpty.title}
      emptyMessage={wardrobeEmpty.message}
      emptyAction={
        <View style={{ gap: space4 }}>
          {addForm}
          {wardrobeEmpty.demoCta ? (
            <Button
              label={wardrobeEmpty.demoCta}
              block
              variant="secondary"
              onPress={() => {
                trackEvent(
                  'empty_cta_tap',
                  emptyCtaTapProps('wardrobe', emptyCopyVariant, 'demo'),
                );
                seedDemoGiftCard();
                markJustConnected('demo');
                router.push('/(closet)/vault' as never);
              }}
            />
          ) : null}
        </View>
      }
      onRefresh={onRefresh}
      refreshing={isRefetching || waste.isRefetching || ingestion.isRefetching}
      skeletonRows={6}
    >
      {addForm}

      <View style={styles.row}>
        <Button
          label="All"
          size="sm"
          variant={activeProfileId == null ? 'secondary' : 'ghost'}
          onPress={() => setActiveProfileId(null)}
        />
        {(profiles.data?.profiles ?? []).map((p) => (
          <Button
            key={p.id}
            label={p.name}
            size="sm"
            variant={activeProfileId === p.id ? 'secondary' : 'ghost'}
            onPress={() => setActiveProfileId(p.id)}
            onLongPress={() => {
              if (!canDeleteClosetProfile(p)) {
                Alert.alert('Protected', 'Your main profile can’t be deleted.');
                return;
              }
              const copy = profileDeleteConfirmCopy(p);
              Alert.alert(copy.title, copy.body, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: copy.confirmLabel,
                  style: 'destructive',
                  onPress: () =>
                    deleteProfile.mutate(p.id, {
                      onSuccess: () => {
                        if (activeProfileId === p.id) setActiveProfileId(null);
                      },
                      onError: (e) => Alert.alert('Failed', (e as Error).message),
                    }),
                },
              ]);
            }}
          />
        ))}
        <Button
          label="+ Kid"
          size="sm"
          variant="ghost"
          disabled={createProfile.isPending}
          onPress={() => {
            if (typeof Alert.prompt === 'function') {
              Alert.prompt('Kids profile', 'Name', (name) => {
                if (!name?.trim()) return;
                createProfile.mutate(
                  { name: name.trim(), kind: 'KID' },
                  {
                    onSuccess: (p) => setActiveProfileId(p.id),
                    onError: (e) => Alert.alert('Failed', (e as Error).message),
                  },
                );
              });
            } else {
              createProfile.mutate(
                { name: 'Kid', kind: 'KID' },
                {
                  onSuccess: (p) => setActiveProfileId(p.id),
                  onError: (e) => Alert.alert('Failed', (e as Error).message),
                },
              );
            }
          }}
        />
        <Button
          label="Household"
          size="sm"
          variant="ghost"
          onPress={() => router.push('/(closet)/household' as never)}
        />
      </View>

      {overdueBanner ? (
        <View style={styles.banner} testID="lent-overdue-banner">
          <Text style={styles.bannerLabel}>{overdueBanner.headline}</Text>
          <Text style={styles.muted}>{overdueBanner.body}</Text>
          <Button
            label="Mark returned"
            size="sm"
            variant="secondary"
            disabled={!overdueBanner.primaryItemId || returnLent.isPending}
            onPress={() => {
              if (!overdueBanner.primaryItemId) return;
              returnLent.mutate(overdueBanner.primaryItemId, {
                onSuccess: () => void lentOverdue.refetch(),
                onError: (e) => Alert.alert('Could not mark returned', (e as Error).message),
              });
            }}
          />
        </View>
      ) : null}

      {waste.data ? (
        <View style={styles.banner}>
          <Text style={styles.bannerLabel}>Cost-per-wear</Text>
          <Text style={styles.bannerValue}>
            {waste.data.avgCostPerWearMinor != null
              ? formatMinor(waste.data.avgCostPerWearMinor)
              : '—'}
          </Text>
          <Text style={styles.muted}>
            {waste.data.totalItems} items · {waste.data.active} active · {waste.data.dormant} dormant ·{' '}
            {waste.data.dead} dead
          </Text>
          {(waste.data.neverWornCostMinor ?? 0) > 0 ? (
            <Text style={styles.muted}>
              Never worn {formatNeverWornAmount(waste.data.neverWornCostMinor ?? 0)}
            </Text>
          ) : null}
          {waste.data.rewearStreak ? (
            <Text style={styles.muted}>
              {waste.data.rewearStreak.label}
              {waste.data.rewearStreak.todayLogged ? '' : ' · log a wear today'}
            </Text>
          ) : null}
          {waste.data.co2WaterSavings && waste.data.co2WaterSavings.kgCo2Saved > 0 ? (
            <Text style={styles.muted}>{waste.data.co2WaterSavings.label}</Text>
          ) : null}
        </View>
      ) : null}

      <PhotoDumpReview />
      <ShoeBagRotationNudge />
      <MissingPieceShopSheet />
      <CompleteLookSheet visible={showCompleteLook} onClose={() => setShowCompleteLook(false)} />
      <AutotagConfirmSheet
        visible={showAutotag}
        drafts={autotagDrafts}
        onCancel={() => {
          setShowAutotag(false);
          setAutotagDrafts([]);
        }}
        onConfirm={(drafts) => {
          setShowAutotag(false);
          setAutotagDrafts([]);
          runBulkImport(drafts);
        }}
      />

      <View style={styles.banner}>
        <Text style={styles.bannerLabel}>Ingestion</Text>
        <Text style={styles.muted}>
          {ingestion.isLoading
            ? 'Checking…'
            : ingestion.data?.connected
              ? `Connected · ${ingestion.data.sourceCount} source(s)`
              : 'Not connected'}
          {ingestion.data ? ` · coverage ${(ingestion.data.coverage * 100).toFixed(1)}%` : ''}
        </Text>
        <View style={{ marginTop: space4 }}>
          <Button
            label="View ingestion metrics →"
            size="sm"
            variant="secondary"
            onPress={() => router.push('/(closet)/metrics' as never)}
          />
        </View>
      </View>

      {laundryBasket.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Laundry basket</Text>
          <Text style={styles.muted}>
            {laundryBasket.length} piece{laundryBasket.length === 1 ? '' : 's'} waiting — outfit generator
            uses clean only.
          </Text>
          <ClosetVirtualList
            data={laundryBasket}
            keyExtractor={(item) => item.id}
            estimatedItemSize={220}
            renderItem={({ item }) => renderItemCard(item)}
            style={styles.list}
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Clean & ready</Text>
        <ClosetVirtualList
          data={cleanItems}
          keyExtractor={(item) => item.id}
          estimatedItemSize={220}
          renderItem={({ item }) => renderItemCard(item)}
          style={styles.list}
          ListEmptyComponent={
            <Text style={styles.muted}>Nothing clean — mark laundry done or add pieces.</Text>
          }
        />
      </View>
    </ClosetScreen>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: closet.surface,
    borderColor: closet.rule,
    borderRadius: radiusMd,
    borderWidth: 1,
    marginTop: space4,
    padding: space4,
  },
  bannerLabel: { color: closet.muted, fontFamily: fontSans, fontSize: fsCaption },
  bannerValue: { color: closet.ink, fontFamily: fontSans, fontSize: 24, fontWeight: '700' },
  card: {
    backgroundColor: closet.surface,
    borderColor: closet.rule,
    borderRadius: radiusMd,
    borderWidth: 1,
    marginBottom: space4,
    padding: space4,
  },
  cardDead: { borderColor: '#f0a0a0', backgroundColor: '#fff6f6' },
  cardDirty: { borderColor: '#c4a574', backgroundColor: '#faf6f0' },
  challenge: {
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '600',
    marginTop: 6,
  },
  form: { gap: space4, marginBottom: space4 },
  importBox: {
    backgroundColor: closet.accentBg,
    borderRadius: radiusMd,
    gap: space4,
    padding: space4,
  },
  input: {
    backgroundColor: closet.bg,
    borderColor: closet.rule,
    borderRadius: radiusMd,
    borderWidth: 1,
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsBody,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  list: { marginTop: space4 },
  merchant: { color: closet.ink, fontFamily: fontSans, fontSize: fsBody, fontWeight: '600' },
  muted: { color: closet.muted, fontFamily: fontSans, fontSize: fsCaption, marginTop: 2 },
  row: { flexDirection: 'row', gap: space4, marginTop: space4, flexWrap: 'wrap' },
  section: { marginTop: space4 },
  sectionTitle: {
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '700',
  },
  thumb: {
    width: '100%',
    height: 180,
    borderRadius: radiusMd,
    marginBottom: space4,
    backgroundColor: closet.mist,
  },
});

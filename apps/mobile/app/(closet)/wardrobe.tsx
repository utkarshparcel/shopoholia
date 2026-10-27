import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  LayoutAnimation,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  buildLentOverdueBanner,
  bulkImportCanCancel,
  bulkImportProgressLabel,
  canDeleteClosetProfile,
  inferWardrobeAutoTag,
  INITIAL_BULK_IMPORT_PROGRESS,
  profileDeleteConfirmCopy,
  reduceBulkImportProgress,
  type AutotagConfirmDraft,
  type BulkImportProgressState,
} from '@worn/shared';
import { Button } from '@/src/components/ui';
import { AutotagConfirmSheet } from '@/src/components/AutotagConfirmSheet';
import { ClosetScreen, type ClosetListSection } from '@/src/components/ClosetScreen';
import { CompleteLookSheet } from '@/src/components/CompleteLookSheet';
import { usePrompt } from '@/src/components/PromptSheet';
import {
  WardrobeItemActionsSheet,
  WardrobeItemCard,
  type WardrobeCardAction,
} from '@/src/components/WardrobeItemCard';
import { formatMinor } from '@/src/lib/format';
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
import type { WardrobeItem, WasteMetricRow } from '@/src/api/client';
import { parseAmountInput } from '@/src/lib/amountInput';
import { CLOSET_OFF_SUBTITLE, closetAlertText } from '@/src/lib/closetScreenState';
import { emptyCtaTapProps, emptyStateCopy } from '@/src/lib/emptyDemo';
import { useClosetPrefsStore } from '@/src/lib/closetPrefs';
import { trackEvent } from '@/src/lib/analytics';
import { FEATURE_CLOSET } from '@/src/lib/features';
import { formatDayKey, localDayKey, parseDayKey } from '@/src/lib/localDay';
import { preparePhotosForUpload } from '@/src/lib/photoPrep';
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

/** Photos picked at once; each is resized before upload. */
const PICK_LIMIT = 20;

function dayKeyError(value: string, label: string): string | null {
  if (!parseDayKey(value)) return `Enter the ${label} as YYYY-MM-DD.`;
  if (value < localDayKey()) return `The ${label} has already passed.`;
  return null;
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
  const emptyCopyVariant = useClosetPrefsStore((s) => s.emptyCopyVariant);
  const currency = useClosetPrefsStore((s) => s.preferredCurrency);
  const capsuleIds = useMemo(() => new Set(capsule.data?.itemIds ?? []), [capsule.data]);
  const { ask, promptElement } = usePrompt();

  const [category, setCategory] = useState('shirt');
  const [brand, setBrand] = useState('');
  const [cost, setCost] = useState('');
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const [previewMap, setPreviewMap] = useState<Record<string, string>>({});
  const [bulkProgress, setBulkProgress] = useState<BulkImportProgressState>(INITIAL_BULK_IMPORT_PROGRESS);
  const cancelBulkRef = useRef(false);
  const [autotagDrafts, setAutotagDrafts] = useState<AutotagConfirmDraft[]>([]);
  const [showAutotag, setShowAutotag] = useState(false);
  const [showCompleteLook, setShowCompleteLook] = useState(false);
  const [moreItemId, setMoreItemId] = useState<string | null>(null);
  // Actions in flight, as "<itemId>:<action>" (or "capsule" for the shared capsule list).
  // A ref mirrors the state so a second tap is ignored before React re-renders.
  const busyRef = useRef(new Set<string>());
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(() => new Set());
  const router = useRouter();
  const ingestion = useIngestionStatus();
  const overdueBanner = buildLentOverdueBanner(lentOverdue.data?.items ?? [], localDayKey());
  const swapPulse = useRef(new Animated.Value(1)).current;

  const refetchWaste = waste.refetch;
  const refetchIngestion = ingestion.refetch;
  const refetchImportable = importable.refetch;
  const refetchCapsule = capsule.refetch;
  const onRefresh = useCallback(() => {
    void Promise.all([refetch(), refetchWaste(), refetchIngestion(), refetchImportable(), refetchCapsule()]);
  }, [refetch, refetchWaste, refetchIngestion, refetchImportable, refetchCapsule]);

  /** Runs one action unless the same one is already in flight, and reports a failure once. */
  const track = useCallback(async (key: string, errorTitle: string, run: () => Promise<void>) => {
    if (busyRef.current.has(key)) return;
    busyRef.current.add(key);
    setBusyKeys(new Set(busyRef.current));
    try {
      await run();
    } catch (e) {
      Alert.alert(errorTitle, closetAlertText(e));
    } finally {
      busyRef.current.delete(key);
      setBusyKeys(new Set(busyRef.current));
    }
  }, []);

  const items = useMemo(() => data?.items ?? [], [data]);
  const metricsById = useMemo(() => {
    const map = new Map<string, WasteMetricRow>();
    for (const m of waste.data?.metrics ?? []) map.set(m.wardrobeItemId, m);
    return map;
  }, [waste.data]);
  const busyByItem = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const key of busyKeys) {
      const at = key.indexOf(':');
      if (at < 0) continue;
      const id = key.slice(0, at);
      map.set(id, [...(map.get(id) ?? []), key.slice(at + 1)]);
    }
    return map;
  }, [busyKeys]);
  const { cleanItems, laundryBasket } = useMemo(() => {
    const clean: WardrobeItem[] = [];
    const laundry: WardrobeItem[] = [];
    for (const i of items) {
      if ((i.laundryStatus ?? 'CLEAN') === 'CLEAN') clean.push(i);
      else laundry.push(i);
    }
    return { cleanItems: clean, laundryBasket: laundry };
  }, [items]);

  async function pickAndAdd() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: PICK_LIMIT,
    });
    if (result.canceled || !result.assets?.length) return;
    let uris: string[];
    setPreparingPhotos(true);
    try {
      uris = await preparePhotosForUpload(result.assets.slice(0, PICK_LIMIT).filter((a) => Boolean(a.uri)));
    } catch (e) {
      Alert.alert('Could not read a photo', closetAlertText(e));
      return;
    } finally {
      setPreparingPhotos(false);
    }
    const typedCost = cost.trim() ? parseAmountInput(cost, currency) : 0;
    if (typedCost == null) {
      Alert.alert('Check the cost', 'Enter the cost as a number, for example 1499 or 1499.50.');
      return;
    }
    const fallbackMeta = {
      category: isAccessoryCategory(category)
        ? createAccessoryCategory(category)
        : category.trim() || 'other',
      brand: brand || null,
      costMinor: typedCost,
    };
    if (uris.length === 1) {
      upload.mutate(
        { imageUri: uris[0]!, meta: fallbackMeta },
        { onError: (e) => Alert.alert('Could not add item', closetAlertText(e)) },
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
    const costMinor = (cost.trim() ? parseAmountInput(cost, currency) : 0) ?? 0;
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
            errors: [...prev.errors, { index: prev.completed, message: closetAlertText(e) }],
          }));
          Alert.alert('Could not bulk import', closetAlertText(e));
        },
      },
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
        onError: (e) => Alert.alert('Could not swap season', closetAlertText(e)),
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
    const imageUri = result.assets[0].uri;
    await track(`${item.id}:care`, 'Could not read care tag', async () => {
      const res = await careOcr.mutateAsync({ id: item.id, imageUri });
      const r = res.careRules;
      Alert.alert('Care label saved', `Wash ${r.wash} · Dry ${r.dry} · Iron ${r.iron} · Dry-clean ${r.dryClean}`);
    });
  }

  async function sendToDryClean(item: WardrobeItem) {
    const values = await ask({
      title: 'Send to dry clean',
      message: 'From the ticket the cleaner gave you.',
      fields: [
        { key: 'ticket', label: 'Ticket number', placeholder: 'e.g. 4821', maxLength: 40 },
        {
          key: 'pickupOn',
          label: 'Pickup date (YYYY-MM-DD)',
          defaultValue: localDayKey(new Date(), 2),
          keyboardType: 'numbers-and-punctuation',
          maxLength: 10,
        },
      ],
      confirmLabel: 'Send',
      validate: (v) => (v.ticket ? dayKeyError(v.pickupOn!, 'pickup date') : 'Enter the ticket number.'),
    });
    if (!values) return;
    const ticket = values.ticket!;
    const pickupOn = values.pickupOn!;
    await track(`${item.id}:dryClean`, 'Could not log dry clean', async () => {
      await dryCleanDrop.mutateAsync({ id: item.id, ticket, pickupOn });
      Alert.alert('At the cleaner', `Ticket ${ticket} · pickup ${formatDayKey(pickupOn)}. We'll nudge you that morning.`);
    });
  }

  async function lend(item: WardrobeItem) {
    const values = await ask({
      title: 'Lend this piece',
      fields: [
        { key: 'lentTo', label: 'Who borrowed it?', placeholder: 'Name', maxLength: 60 },
        {
          key: 'dueOn',
          label: 'Due back (YYYY-MM-DD)',
          defaultValue: localDayKey(new Date(), 7),
          keyboardType: 'numbers-and-punctuation',
          maxLength: 10,
        },
      ],
      confirmLabel: 'Lend',
      validate: (v) => (v.lentTo ? dayKeyError(v.dueOn!, 'due date') : 'Enter who borrowed it.'),
    });
    if (!values) return;
    const lentTo = values.lentTo!;
    const dueOn = values.dueOn!;
    await track(`${item.id}:lend`, 'Could not lend', async () => {
      await lendItem.mutateAsync({ id: item.id, lentTo, dueOn });
      Alert.alert('Lent', `${lentTo} · due ${formatDayKey(dueOn)}.`);
    });
  }

  async function askCpwGoal(item: WardrobeItem, label: string) {
    const values = await ask({
      title: 'Cost-per-wear goal',
      message: `What should each wear of ${label} cost you? Wear it until it gets there.`,
      fields: [{ key: 'amount', label: `Target per wear (${currency})`, placeholder: 'e.g. 500', keyboardType: 'decimal-pad' }],
      confirmLabel: 'Set goal',
      validate: (v) => (parseAmountInput(v.amount!, currency) ? null : 'Enter an amount above zero, for example 500.'),
    });
    if (!values) return;
    const targetCpwMinor = parseAmountInput(values.amount!, currency)!;
    await track(`${item.id}:cpw`, 'Could not set the goal', async () => {
      const res = await setCpw.mutateAsync({ itemId: item.id, targetCpwMinor });
      Alert.alert('Goal set', cpwGoalNudgeCopy(res.cpwGoal, label));
    });
  }

  async function addKidProfile() {
    const values = await ask({
      title: 'Add a kids profile',
      message: 'Keep a child’s clothes in their own closet.',
      fields: [{ key: 'name', label: 'Name', placeholder: 'Name', maxLength: 40 }],
      confirmLabel: 'Add',
      validate: (v) => (v.name ? null : 'Enter a name.'),
    });
    if (!values) return;
    const name = values.name!;
    await track('profile:create', 'Could not add the profile', async () => {
      const p = await createProfile.mutateAsync({ name, kind: 'KID' });
      setActiveProfileId(p.id);
    });
  }

  // The prompt sheet, not Alert: it asks on web too, where Alert.alert shows nothing.
  async function confirmDispose(item: WardrobeItem, label: string) {
    const ok = await ask({
      title: 'Sell this piece?',
      message: `This lists ${label} for resale. You can manage it under Sell & donate.`,
      fields: [],
      confirmLabel: 'List it',
    });
    if (!ok) return;
    await track(`${item.id}:dispose`, 'Could not list it', async () => {
      await dispose.mutateAsync({ itemId: item.id, mode: 'SELL' });
      Alert.alert('Listed', `${label} is listed for resale.`);
    });
  }

  function handleAction(action: WardrobeCardAction, item: WardrobeItem) {
    const metric = metricsById.get(item.id);
    const label = item.brand || item.category;
    const started = wearChallengeIds.includes(item.id);
    switch (action) {
      case 'more':
        setMoreItemId(item.id);
        return;
      case 'tryon':
        void track(`${item.id}:tryon`, 'Could not start try-on', async () => {
          const res = await tryon.mutateAsync(item.id);
          if (res.previewUrl) setPreviewMap((m) => ({ ...m, [item.id]: res.previewUrl! }));
        });
        return;
      case 'wear':
        void track(`${item.id}:wear`, 'Could not log the wear', async () => {
          const wearCount = metric?.wearCount ?? 0;
          await wear.mutateAsync({ wardrobeItemId: item.id, priorWearCount: wearCount });
          if (!started) return;
          if (wearChallengeProgress(wearCount + 1, metric?.status, { started: true }).completed) {
            Alert.alert('Challenge complete', wearChallengeCelebrateCopy(label));
          }
          const goalNext = cpwGoalProgress(
            item.costMinor,
            wearCount + 1,
            metric?.targetCpwMinor ?? metric?.cpwGoal?.targetCpwMinor ?? null,
          );
          if (goalNext.active && goalNext.completed) Alert.alert('CPW goal hit', cpwGoalCelebrateCopy(label));
        });
        return;
      case 'challenge':
        void track(`${item.id}:challenge`, 'Could not start the challenge', async () => {
          await challenge.mutateAsync(item.id);
          const progress = wearChallengeProgress(metric?.wearCount ?? 0, metric?.status, { started: true });
          Alert.alert('Challenge on', wearChallengeNudgeCopy(progress, label));
        });
        return;
      case 'capsule': {
        // The whole capsule list is saved at once, so toggles run one at a time.
        void track('capsule', 'Could not update the capsule', async () => {
          const next = capsuleIds.has(item.id)
            ? [...capsuleIds].filter((id) => id !== item.id)
            : [...capsuleIds, item.id];
          await saveCapsuleMut.mutateAsync(next);
        });
        return;
      }
      case 'cpw':
        void askCpwGoal(item, label);
        return;
      case 'laundry': {
        const next: WardrobeItem['laundryStatus'] =
          item.laundryStatus === 'CLEAN' || !item.laundryStatus ? 'DIRTY' : 'CLEAN';
        void track(`${item.id}:laundry`, 'Could not update laundry', async () => {
          await updateItem.mutateAsync({ id: item.id, patch: { laundryStatus: next } });
        });
        return;
      }
      case 'care':
        void snapCareTag(item);
        return;
      case 'dryClean':
        void sendToDryClean(item);
        return;
      case 'pickedUp':
        void track(`${item.id}:pickedUp`, 'Could not confirm pickup', async () => {
          await dryCleanDone.mutateAsync(item.id);
          Alert.alert('Back in closet', 'Marked clean and ready to wear.');
        });
        return;
      case 'lend':
        void lend(item);
        return;
      case 'returned':
        void track(`${item.id}:returned`, 'Could not mark returned', async () => {
          await returnLent.mutateAsync(item.id);
        });
        return;
      case 'store': {
        const next: NonNullable<WardrobeItem['closetStatus']> =
          item.closetStatus === 'STORED' ? 'ACTIVE' : 'STORED';
        void track(`${item.id}:store`, 'Could not update closet', async () => {
          await updateItem.mutateAsync({ id: item.id, patch: { closetStatus: next } });
        });
        return;
      }
      case 'dispose':
        void confirmDispose(item, label);
        return;
    }
  }

  // Cards get one stable callback, so a re-render here doesn't re-render every card.
  const actionRef = useRef(handleAction);
  useEffect(() => {
    actionRef.current = handleAction;
  });
  const onAction = useCallback((action: WardrobeCardAction, item: WardrobeItem) => actionRef.current(action, item), []);

  const renderCard = useCallback(
    (item: WardrobeItem) => {
      const metric = metricsById.get(item.id);
      return (
        <WardrobeItemCard
          item={item}
          metric={metric}
          preview={previewMap[item.id] ?? item.garmentImageUrl ?? item.imageUrls?.[0]}
          currency={currency}
          started={wearChallengeIds.includes(item.id)}
          isDead={metric?.status === 'DEAD'}
          busy={(busyByItem.get(item.id) ?? []).join(',')}
          onAction={onAction}
        />
      );
    },
    [metricsById, previewMap, currency, wearChallengeIds, busyByItem, onAction],
  );

  if (!FEATURE_CLOSET) {
    return <ClosetScreen title="Wardrobe" subtitle={CLOSET_OFF_SUBTITLE} />;
  }

  const hasContent = items.length > 0;
  const isEmpty = !isLoading && !isError && items.length === 0;
  const pendingPurchases = (importable.data?.items ?? []).filter((i) => !i.alreadyInWardrobe);
  const moreItem = moreItemId ? (items.find((i) => i.id === moreItemId) ?? null) : null;
  const wardrobeEmpty = emptyStateCopy('wardrobe', emptyCopyVariant);
  const uploading = preparingPhotos || upload.isPending || bulkUpload.isPending;

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
        placeholder={`Cost in ${currency} (optional)`}
        placeholderTextColor={closet.muted}
        keyboardType="decimal-pad"
        value={cost}
        onChangeText={setCost}
      />
      <Button
        label={
          preparingPhotos
            ? 'Preparing photos…'
            : upload.isPending || bulkUpload.isPending
              ? `Uploading ${bulkImportProgressLabel(bulkProgress)}…`
              : 'Add photos (multi-select)'
        }
        block
        disabled={uploading}
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
              · {p.title} · {p.merchant} · {formatMinor(p.priceMinor, currency)}
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
                  onError: (e) => Alert.alert('Could not import', closetAlertText(e)),
                },
              )
            }
          />
        </View>
      ) : null}
    </View>
  );

  const sections: ClosetListSection<WardrobeItem>[] = [
    ...(laundryBasket.length > 0
      ? [
          {
            key: 'laundry',
            header: (
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  Laundry basket
                </Text>
                <Text style={styles.muted}>
                  {laundryBasket.length} piece{laundryBasket.length === 1 ? '' : 's'} waiting — outfit
                  generator uses clean only.
                </Text>
              </View>
            ),
            data: laundryBasket,
          },
        ]
      : []),
    {
      key: 'clean',
      header: (
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Clean & ready
          </Text>
        </View>
      ),
      data: cleanItems,
      empty: <Text style={styles.muted}>Nothing clean — mark laundry done or add pieces.</Text>,
    },
  ];

  return (
    <ClosetScreen<WardrobeItem>
      title="Wardrobe"
      subtitle="Every piece you own. Tap try-on to see it styled, log a wear, or clear dead inventory."
      loading={isLoading}
      loadingLabel="Loading your closet…"
      hasContent={hasContent}
      error={isError ? closetAlertText(error) : null}
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
          {promptElement}
        </View>
      }
      onRefresh={onRefresh}
      refreshing={isRefetching || waste.isRefetching || ingestion.isRefetching}
      skeletonRows={6}
      list={{ sections, keyExtractor: (item) => item.id, renderItem: renderCard }}
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
                      onError: (e) => Alert.alert('Failed', closetAlertText(e)),
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
          accessibilityLabel="Add a kids profile"
          disabled={busyKeys.has('profile:create')}
          onPress={() => void addKidProfile()}
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
                onError: (e) => Alert.alert('Could not mark returned', closetAlertText(e)),
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
              ? formatMinor(waste.data.avgCostPerWearMinor, currency)
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
      {showCompleteLook ? (
        <CompleteLookSheet visible onClose={() => setShowCompleteLook(false)} />
      ) : null}
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
      <WardrobeItemActionsSheet
        item={moreItem}
        metric={moreItem ? metricsById.get(moreItem.id) : undefined}
        inCapsule={moreItem ? capsuleIds.has(moreItem.id) : false}
        isDead={moreItem ? metricsById.get(moreItem.id)?.status === 'DEAD' : false}
        busy={[...(moreItem ? (busyByItem.get(moreItem.id) ?? []) : []), ...(busyKeys.has('capsule') ? ['capsule'] : [])].join(',')}
        onAction={onAction}
        onClose={() => setMoreItemId(null)}
      />
      {promptElement}

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
        {__DEV__ ? (
          <View style={{ marginTop: space4 }}>
            <Button
              label="View ingestion metrics →"
              size="sm"
              variant="secondary"
              onPress={() => router.push('/(closet)/metrics' as never)}
            />
          </View>
        ) : null}
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
  muted: { color: closet.muted, fontFamily: fontSans, fontSize: fsCaption, marginTop: 2 },
  row: { flexDirection: 'row', gap: space4, marginTop: space4, flexWrap: 'wrap' },
  sectionHead: { marginBottom: space4, marginTop: space4 },
  sectionTitle: {
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '700',
  },
});

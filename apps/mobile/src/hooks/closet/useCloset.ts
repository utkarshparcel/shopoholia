import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import {
  addCredit,
  bookReturnPickup,
  borrowSwapListing,
  buildTravelPack,
  cancelReturnPickup,
  captureCreditBarcode,
  captureCreditPhoto,
  careOcrWardrobeItem,
  careOcrWardrobePhoto,
  checkCreditBalance,
  checkPrebuyFit,
  claimWarranty,
  confirmCreditBalance,
  confirmReceipt,
  confirmReturn,
  correctIngestionDocument,
  correctReturnWindow,
  createBudget,
  createCashbackClaim,
  createClosetProfile,
  deleteClosetProfile,
  createDisposition,
  createGiftOrder,
  createHousehold,
  createMeasurement,
  createRecipient,
  createSwapCircle,
  createTailoringOrder,
  deleteVault,
  escalateRefundChase,
  deleteWardrobeItem,
  disposeWasteItem,
  dryCleanConfirm,
  dryCleanDropOff,
  exportReceipt,
  exportVaultData,
  fetchAccountantExportCsv,
  fetchAccountantLedger,
  fetchAccountantSeasonRoi,
  fetchAccountantSummary,
  fetchBudgets,
  fetchCapsule,
  fetchCashbackClaims,
  fetchClosetProfiles,
  fetchCompleteLook,
  fetchCredits,
  fetchDisposition,
  fetchExchanges,
  fetchFitTailors,
  fetchGoesWith,
  fetchHouseholds,
  fetchHouseholdWardrobe,
  fetchHouseholdVault,
  patchHouseholdVaultMember,
  spendHouseholdVault,
  fetchImportablePurchases,
  fetchLentWardrobe,
  fetchIngestionActivity,
  fetchMeasurements,
  fetchMissingPieces,
  fetchPackages,
  runPhotoDumpFromUris,
  fetchPurchases,
  fetchReceipts,
  fetchRecipientIdeas,
  fetchRecipients,
  fetchRefundEtaBoard,
  fetchReplaceTwins,
  fetchReturnDetail,
  fetchReturns,
  fetchRtoRecovery,
  fetchRewearStreak,
  fetchShoeBagRotation,
  fetchSizeMap,
  fetchSwapCircles,
  fetchSwapListings,
  fetchTailoringOrder,
  fetchTailoringOrders,
  fetchTemplates,
  fetchTodayOutfit,
  fetchWardrobe,
  fetchWarranties,
  fetchWasteDead,
  fetchWasteSummary,
  fetchWeekOutfits,
  generateWeekOutfit,
  patchWeekDayOutfit,
  initiateReturn,
  joinHousehold,
  joinSwapCircle,
  lendWardrobeItem,
  logWear,
  markCashbackClaimed,
  markPackageDelivered,
  markReturnRefunded,
  rescheduleReturnPickup,
  snoozeRefundChase,
  attachDeliveryProof,
  fixRtoAddress,
  updatePackage,
  mergePurchases,
  outfitsFromCalendar,
  patchIngestionSource,
  planWeddingFestival,
  planWorkwearWeek,
  previewFitCustomization,
  recordReplaceTwinClick,
  reorderTailoringOrder,
  returnLentWardrobeItem,
  saveCapsule,
  saveInterviewKit,
  patchInterviewKit,
  seasonalSwapWardrobe,
  selectTodayOutfit,
  setCpwGoal,
  snoozeWarranty,
  spendCredit,
  undoSpendCredit,
  mergeCredits,
  markCreditExpiryHandled,
  splitPurchase,
  startRtoRefund,
  createReturn,
  startDeclutterChallenge,
  startWearChallenge,
  trackPlayBuyInCloset,
  tryOnWardrobeItem,
  unclaimWarranty,
  updateWardrobeItem,
  bulkUpdateWardrobeItems,
  BULK_UPDATE_MAX_IDS,
  scanPriceDrops,
  createBrandPriceWatch,
  fetchEmiPlans,
  payEmiPlan,
  createEmiFromSms,
  uploadReceipt,
  uploadWardrobeItem,
  uploadWardrobeItemsBulk,
  uploadWearPhoto,
  wardrobeFromPurchases,
} from '@/src/api/client';
import type {
  AddCreditBody,
  ConfirmReceiptBody,
  CreateBrandPriceWatchBody,
  CreditCaptureResponse,
  MoneyAccountKind,
} from '@worn/shared';
import type { CorrectIngestionDocumentBody, WardrobeItem, WardrobePage } from '@/src/api/client';
import { useSessionStore } from '@/src/stores/session';
import { useClosetStore } from '@/src/stores/closet';
import { newIdempotencyKey } from '@/src/lib/idempotency';
import { closetKey, sessionToken, useClosetSubscribed, useSessionUserId } from './keys';
import { ingestionSourcesQuery } from './useIngestion';
import { trackEvent } from '@/src/lib/analytics';
import { localDayKey } from '@/src/lib/format';
import { shareTextFile } from '@/src/lib/shareFile';
import { travelPackSharePayload } from '@/src/lib/todayOccasionWow';
import { wearChallengeProgress } from '@/src/lib/wearChallenge';

/**
 * TanStack Query namespace for the Closet surface.
 *
 * Keys come from `closetKey` (keys.ts): `[domain, userId, ...params]`, so a token renewal keeps
 * the cache. Each queryFn reads the current token when it runs (`sessionToken()`), and mutations
 * invalidate by `[domain]`. The ingestion hooks live in useIngestion.ts and are re-exported here.
 */
export {
  ingestionSourcesQuery,
  useCloset,
  useIngestionMetrics,
  useIngestionSources,
  useIngestionStatus,
} from './useIngestion';

export function useIngestionActivity() {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('ingestion-activity', userId),
    queryFn: () => fetchIngestionActivity(sessionToken()),
    enabled: Boolean(userId),
    subscribed: useClosetSubscribed(),
  });
}

export function useCorrectIngestionDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { documentId: string; body: CorrectIngestionDocumentBody }) =>
      correctIngestionDocument(sessionToken(), input.documentId, input.body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ingestion-activity'] });
      void qc.invalidateQueries({ queryKey: ['ingestion-metrics'] });
      trackEvent('ingestion_corrected' as never);
    },
  });
}

/** Mute a merchant on the first EMAIL ingestion source (N47). */
export function useMuteMerchant() {
  const userId = useSessionUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (merchant: string) => {
      // The cached list when it's fresh; one request otherwise.
      const { sources } = await qc.fetchQuery(ingestionSourcesQuery(userId));
      const source =
        sources.find((s) => s.kind === 'EMAIL') ?? sources[0];
      if (!source) throw new Error('Connect email before muting merchants.');
      const prev =
        (source.meta as { mutedMerchants?: string[] } | null | undefined)?.mutedMerchants ??
        [];
      const next = Array.from(
        new Set([...prev.map((m) => m.trim()), merchant.trim()].filter(Boolean)),
      );
      return patchIngestionSource(sessionToken(), source.id, { mutedMerchants: next });
    },
    onSuccess: (_data, merchant) => {
      void qc.invalidateQueries({ queryKey: ['ingestion-sources'] });
      trackEvent('ingestion_merchant_muted' as never, { merchant });
    },
  });
}

/** N48 — list purchases with items for merge/split. */
export function usePurchases() {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('purchases', userId),
    queryFn: ({ signal }) => fetchPurchases(sessionToken(), signal),
    enabled: Boolean(userId),
    subscribed: useClosetSubscribed(),
  });
}

export function useMergePurchases() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { targetPurchaseId: string; sourcePurchaseId: string }) =>
      mergePurchases(sessionToken(), body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['purchases'] });
      void qc.invalidateQueries({ queryKey: ['ingestion-activity'] });
      void qc.invalidateQueries({ queryKey: ['packages'] });
      trackEvent('purchases_merged');
    },
  });
}

export function useSplitPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { purchaseId: string; itemIds: string[]; merchant?: string }) =>
      splitPurchase(sessionToken(), body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['purchases'] });
      void qc.invalidateQueries({ queryKey: ['packages'] });
      trackEvent('purchases_split');
    },
  });
}

export function useGiftCards(kind?: MoneyAccountKind) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('gift-cards', userId, kind ?? 'all'),
    queryFn: () =>
      kind ? fetchCredits(sessionToken(), { kind }) : fetchCredits(sessionToken()),
    enabled: Boolean(userId),
    subscribed: useClosetSubscribed(),
  });
}

export function useAddGiftCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddCreditBody) =>
      addCredit(sessionToken(), {
        ...input,
        idempotencyKey: input.idempotencyKey ?? newIdempotencyKey(),
      }),
    onSuccess: (account) => {
      trackEvent('credit_added', { accountId: account.id, kind: account.kind });
      queryClient.invalidateQueries({ queryKey: ['gift-cards'] });
    },
  });
}

export function useCaptureGiftCard() {
  return useMutation({
    mutationFn: async (
      input:
        | { mode: 'barcode'; barcode: string }
        | { mode: 'photo'; imageUri: string; barcode?: string },
    ): Promise<CreditCaptureResponse> => {
      const accessToken = sessionToken('Sign in to capture a card');
      if (input.mode === 'barcode') {
        return captureCreditBarcode(accessToken, input.barcode);
      }
      return captureCreditPhoto(accessToken, input.imageUri, {
        barcode: input.barcode,
      });
    },
    onSuccess: (result) => {
      trackEvent('credit_captured', {
        source: result.capture.source,
        hasMerchant: Boolean(result.merchant),
      });
    },
  });
}

export function useSpendGiftCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      amountMinor,
      idempotencyKey,
    }: {
      id: string;
      amountMinor: number;
      idempotencyKey?: string;
    }) => {
      const key = idempotencyKey ?? newIdempotencyKey();
      const result = await spendCredit(sessionToken(), id, {
        amountMinor,
        idempotencyKey: key,
      });
      return { ...result, idempotencyKey: key, amountMinor, id };
    },
    onSuccess: (result, vars) => {
      trackEvent('credit_spent', { accountId: vars.id, amountMinor: vars.amountMinor });
      queryClient.invalidateQueries({ queryKey: ['gift-cards'] });
    },
  });
}

/** U001 — undo partial spend within 60s. */
export function useUndoSpendGiftCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      idempotencyKey,
    }: {
      id: string;
      idempotencyKey: string;
    }) => undoSpendCredit(sessionToken(), id, { idempotencyKey }),
    onSuccess: (_result, vars) => {
      trackEvent('credit_spend_undone', { accountId: vars.id });
      queryClient.invalidateQueries({ queryKey: ['gift-cards'] });
    },
  });
}

/** U002 — merge same-merchant credit twins. */
export function useMergeCredits() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { targetAccountId: string; sourceAccountId: string }) =>
      mergeCredits(sessionToken(), body),
    onSuccess: (result) => {
      trackEvent('credits_merged', {
        targetAccountId: result.account.id,
        sourceAccountId: result.mergedFromId,
        transferredMinor: result.transferredMinor,
      });
      queryClient.invalidateQueries({ queryKey: ['gift-cards'] });
    },
  });
}

/** U003 — mark expiry checklist handled (snooze push 7d). */
export function useMarkCreditExpiryHandled() {
  return useMutation({
    mutationFn: (id: string) => markCreditExpiryHandled(sessionToken(), id),
    onSuccess: (_result, id) => {
      trackEvent('credit_expiry_handled', { accountId: id });
    },
  });
}

/** WV02-BALANCE-CHECK — API refresh or manual re-check hint. */
export function useBalanceCheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => checkCreditBalance(sessionToken(), id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gift-cards'] });
    },
  });
}

/** WV02-BALANCE-CHECK — confirm user-verified merchant balance. */
export function useConfirmBalance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      balanceMinor,
    }: {
      id: string;
      balanceMinor: number;
    }) =>
      confirmCreditBalance(sessionToken(), id, {
        balanceMinor,
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: (_result, vars) => {
      trackEvent('credit_balance_confirmed', {
        accountId: vars.id,
        balanceMinor: vars.balanceMinor,
      });
      queryClient.invalidateQueries({ queryKey: ['gift-cards'] });
    },
  });
}

// --- Universe P1.2: receipts & warranties ---

export function useReceipts(query?: {
  merchant?: string;
  from?: string;
  to?: string;
  gstin?: string;
}) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('receipts', userId, query?.merchant, query?.from, query?.to, query?.gstin),
    queryFn: () => fetchReceipts(sessionToken(), query),
    enabled: Boolean(userId),
    subscribed: useClosetSubscribed(),
  });
}

export function useExportReceipt() {
  return useMutation({
    mutationFn: (input: { id: string; format: 'image' | 'pdf' }) =>
      exportReceipt(sessionToken(), input.id, input.format),
    onSuccess: (res) => {
      trackEvent('receipt_exported' as never, { format: res.format });
    },
  });
}

export function useUploadReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (imageUri: string) => uploadReceipt(sessionToken(), imageUri),
    onSuccess: (parsed) => {
      trackEvent('receipt_uploaded', { receiptId: parsed.id });
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
    },
  });
}

export function useConfirmReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ConfirmReceiptBody }) =>
      confirmReceipt(sessionToken(), id, body),
    onSuccess: (_result, vars) => {
      trackEvent('receipt_confirmed', { receiptId: vars.id });
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      queryClient.invalidateQueries({ queryKey: ['warranties'] });
    },
  });
}

export function useWarranties() {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('warranties', userId),
    queryFn: () => fetchWarranties(sessionToken()),
    enabled: Boolean(userId),
    subscribed: useClosetSubscribed(),
  });
}

export function useClaimWarranty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => claimWarranty(sessionToken(), id),
    onSuccess: (result) => {
      trackEvent('warranty_claimed');
      queryClient.invalidateQueries({ queryKey: ['warranties'] });
      return result;
    },
  });
}

export function useUnclaimWarranty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unclaimWarranty(sessionToken(), id),
    onSuccess: () => {
      trackEvent('warranty_unclaimed' as never);
      queryClient.invalidateQueries({ queryKey: ['warranties'] });
    },
  });
}

export function useCashbackClaims(status?: 'UNCLAIMED' | 'CLAIMED' | 'EXPIRED') {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('cashback-claims', userId, status ?? 'all'),
    queryFn: () => fetchCashbackClaims(sessionToken(), status),
    enabled: Boolean(userId),
  });
}

export function useCreateCashbackClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof createCashbackClaim>[1]) =>
      createCashbackClaim(sessionToken(), body),
    onSuccess: () => {
      trackEvent('cashback_claim_created');
      queryClient.invalidateQueries({ queryKey: ['cashback-claims'] });
    },
  });
}

export function useMarkCashbackClaimed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markCashbackClaimed(sessionToken(), id),
    onSuccess: () => {
      trackEvent('cashback_claim_marked');
      queryClient.invalidateQueries({ queryKey: ['cashback-claims'] });
    },
  });
}

export function useSnoozeWarranty() {
  return useMutation({
    mutationFn: ({
      id,
      days,
      until,
    }: {
      id: string;
      days?: number;
      until?: string;
    }) => snoozeWarranty(sessionToken(), id, { days, until }),
    onSuccess: () => {
      trackEvent('warranty_snoozed');
    },
  });
}

// --- Universe P2: wardrobe / outfits / waste ---
/** Items per wardrobe page (C3). A screen that shows a few items passes a smaller `limit`. */
export const WARDROBE_PAGE_SIZE = 50;

function selectWardrobeItems(data: InfiniteData<WardrobePage, string | null>) {
  return { items: data.pages.flatMap((page) => page.items), pageCount: data.pages.length };
}

/**
 * The wardrobe, one page at a time (MOB 14). `data.items` holds every page loaded so far;
 * call `fetchNextPage` while `hasNextPage` (e.g. from a list's onEndReached) to load more.
 */
export function useWardrobe(
  profileId?: string | null,
  opts?: { enabled?: boolean; limit?: number },
) {
  const userId = useSessionUserId();
  const limit = opts?.limit ?? WARDROBE_PAGE_SIZE;
  return useInfiniteQuery({
    queryKey: closetKey('wardrobe', userId, profileId ?? null, limit),
    queryFn: ({ pageParam, signal }) =>
      fetchWardrobe(sessionToken(), profileId, { limit, cursor: pageParam }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    select: selectWardrobeItems,
    enabled: (opts?.enabled ?? true) && Boolean(userId),
  });
}

/**
 * MOB 21: one patch for many items through PATCH /wardrobe/items (C4), at most 200 ids per
 * request and one request at a time. Ids whose request failed come back in `failedIds`; the
 * mutation only rejects when nothing was updated. The wardrobe and outfits refresh once.
 */
export function useBulkUpdateWardrobe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ids,
      patch,
    }: {
      ids: string[];
      patch: Parameters<typeof bulkUpdateWardrobeItems>[2];
    }) => {
      const unique = Array.from(new Set(ids));
      const updated: WardrobeItem[] = [];
      const failedIds: string[] = [];
      let lastError: unknown = null;
      for (let i = 0; i < unique.length; i += BULK_UPDATE_MAX_IDS) {
        const chunk = unique.slice(i, i + BULK_UPDATE_MAX_IDS);
        try {
          const res = await bulkUpdateWardrobeItems(sessionToken(), chunk, patch);
          updated.push(...res.items);
        } catch (error) {
          failedIds.push(...chunk);
          lastError = error;
        }
      }
      if (updated.length === 0 && lastError) throw lastError;
      return { updated, failedIds };
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['wardrobe'] });
      void queryClient.invalidateQueries({ queryKey: ['today-outfit'] });
      void queryClient.invalidateQueries({ queryKey: ['week-outfits'] });
    },
  });
}

export function useUploadWardrobeItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ imageUri, meta }: { imageUri: string; meta: { category: string; colors?: string[]; brand?: string | null; costMinor?: number } }) => uploadWardrobeItem(sessionToken(), imageUri, meta),
    onSuccess: (item) => {
      trackEvent('wardrobe_item_added', { itemId: item.id });
      queryClient.invalidateQueries({ queryKey: ['wardrobe'] });
      queryClient.invalidateQueries({ queryKey: ['waste-summary'] });
    },
  });
}

export function useBulkUploadWardrobe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      imageUris,
      meta,
      onProgress,
      shouldCancel,
      perItemMeta,
    }: {
      imageUris: string[];
      meta: { category: string; colors?: string[]; brand?: string | null; costMinor?: number };
      onProgress?: (p: {
        index: number;
        total: number;
        ok: boolean;
        error?: string;
        item?: WardrobeItem;
      }) => void;
      shouldCancel?: () => boolean;
      perItemMeta?: Array<{
        category: string;
        colors?: string[];
        brand?: string | null;
        costMinor?: number;
      }>;
    }) =>
      uploadWardrobeItemsBulk(sessionToken(), imageUris, meta, {
        onProgress,
        shouldCancel,
        perItemMeta,
      }),
    onSuccess: (res) => {
      trackEvent('wardrobe_bulk_imported', { count: res.created });
      queryClient.invalidateQueries({ queryKey: ['wardrobe'] });
      queryClient.invalidateQueries({ queryKey: ['waste-summary'] });
    },
  });
}

export function useWardrobeFromPurchases() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (purchaseItemIds: string[]) => wardrobeFromPurchases(sessionToken(), purchaseItemIds),
    onSuccess: (res) => {
      trackEvent('wardrobe_from_purchases', { count: res.created });
      queryClient.invalidateQueries({ queryKey: ['wardrobe'] });
      queryClient.invalidateQueries({ queryKey: ['waste-summary'] });
      queryClient.invalidateQueries({ queryKey: ['importable-purchases'] });
    },
  });
}

export function useImportablePurchases() {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('importable-purchases', userId),
    queryFn: () =>
      fetchImportablePurchases(sessionToken()),
    enabled: Boolean(userId),
  });
}

export function useWardrobeTryon() {
  return useMutation({
    mutationFn: (id: string) => tryOnWardrobeItem(sessionToken(), id),
    onSuccess: (_res, id) => trackEvent('wardrobe_tryon_requested', { itemId: id }),
  });
}

export function useUpdateWardrobeItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        category?: string;
        colors?: string[];
        brand?: string | null;
        costMinor?: number;
        laundryStatus?: WardrobeItem['laundryStatus'];
        closetStatus?: WardrobeItem['closetStatus'];
        tags?: string[];
      };
    }) => updateWardrobeItem(sessionToken(), id, patch),
    onSuccess: (item) => {
      trackEvent('wardrobe_item_updated', {
        itemId: item.id,
        laundryStatus: item.laundryStatus,
        closetStatus: item.closetStatus,
      });
      queryClient.invalidateQueries({ queryKey: ['wardrobe'] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit'] });
    },
  });
}

export function useCareOcrWardrobeItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      imageKey,
      ocrText,
      imageUri,
    }: {
      id: string;
      imageKey?: string;
      ocrText?: string;
      imageUri?: string;
    }) =>
      imageUri
        ? careOcrWardrobePhoto(sessionToken(), id, imageUri)
        : careOcrWardrobeItem(sessionToken(), id, { imageKey, ocrText }),
    onSuccess: (res) => {
      trackEvent('wardrobe_care_ocr', { itemId: res.itemId });
      queryClient.invalidateQueries({ queryKey: ['wardrobe'] });
    },
  });
}

export function useDryCleanDropOff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ticket,
      pickupOn,
    }: {
      id: string;
      ticket: string;
      pickupOn: string;
    }) => dryCleanDropOff(sessionToken(), id, { ticket, pickupOn }),
    onSuccess: (res) => {
      trackEvent('wardrobe_dry_clean_drop_off', { itemId: res.item.id, phase: res.phase });
      queryClient.invalidateQueries({ queryKey: ['wardrobe'] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit'] });
    },
  });
}

export function useDryCleanConfirm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dryCleanConfirm(sessionToken(), id),
    onSuccess: (res) => {
      trackEvent('wardrobe_dry_clean_confirm', { itemId: res.item.id, phase: res.phase });
      queryClient.invalidateQueries({ queryKey: ['wardrobe'] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit'] });
    },
  });
}

export function useSeasonalSwap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { season: 'summer' | 'winter' | 'monsoon'; tagItemIds?: string[] }) =>
      seasonalSwapWardrobe(sessionToken(), body),
    onSuccess: (res) => {
      trackEvent('wardrobe_seasonal_swap', { season: res.season, active: res.active, stored: res.stored });
      queryClient.invalidateQueries({ queryKey: ['wardrobe'] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit'] });
    },
  });
}

export function useTravelPack() {
  return useMutation({
    mutationFn: (body: { startDate: string; endDate: string; maxItems?: number }) =>
      buildTravelPack(sessionToken(), body),
    onSuccess: async (pack) => {
      trackEvent('travel_pack_built', { nights: pack.nights, count: pack.items.length });
      const share = travelPackSharePayload(pack.checklist);
      await shareTextFile({
        fileName: `travel-pack-${pack.startDate}.md`,
        contents: share.message,
        mimeType: 'text/markdown',
        dialogTitle: share.dialogTitle,
      });
    },
  });
}

export function useWorkwearRotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { weekStart?: string; commit?: boolean; unique?: boolean } = {}) =>
      planWorkwearWeek(sessionToken(), body),
    onSuccess: (res) => {
      trackEvent('workwear_rotation_planned', { days: res.days.length, unique: res.unique });
      queryClient.invalidateQueries({ queryKey: ['week-outfits'] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit'] });
    },
  });
}

/** N03 — calendar events → occasion outfits (+ optional night-before reminder). */
export function useOutfitsFromCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      events: Array<{ id?: string; title?: string; startAt: string; endAt?: string }>;
      remindNightBefore?: boolean;
      commit?: boolean;
    }) => outfitsFromCalendar(sessionToken(), body),
    onSuccess: (res) => {
      trackEvent('cal_event_outfit' as never, {
        count: res.events.length,
        occasions: res.events.map((e) => e.occasion).join(','),
      });
      queryClient.invalidateQueries({ queryKey: ['week-outfits'] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit'] });
    },
  });
}

/** N39 — wedding / festival multi-day planner. */
export function useWeddingFestivalPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      startDate: string;
      endDate: string;
      kind: 'wedding' | 'festival';
      label?: string;
      budgetLimitMinor?: number;
      plannedSpendMinor?: number;
      commit?: boolean;
    }) => planWeddingFestival(sessionToken(), body),
    onSuccess: (res) => {
      trackEvent('wedding_festival_planned' as never, {
        kind: res.kind,
        dayCount: res.dayCount,
      });
      queryClient.invalidateQueries({ queryKey: ['week-outfits'] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit'] });
    },
  });
}

/** N40 — save interview / ceremony kit. */
export function useSaveInterviewKit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      kind?: 'interview' | 'ceremony';
      itemIds: string[];
      eventAt: string;
      remindNightBefore?: boolean;
      commit?: boolean;
    }) => saveInterviewKit(sessionToken(), body),
    onSuccess: (res) => {
      trackEvent('interview_kit_saved' as never, {
        kind: res.kit.kind,
        reminded: res.kit.reminderScheduled,
      });
      queryClient.invalidateQueries({ queryKey: ['week-outfits'] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit'] });
    },
  });
}

/** W056 — edit / cancel night-before reminder. */
export function usePatchInterviewKit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      eventAt?: string;
      cancelReminder?: boolean;
      remindNightBefore?: boolean;
    }) => {
      const { id, ...body } = input;
      return patchInterviewKit(sessionToken(), id, body);
    },
    onSuccess: (res) => {
      trackEvent('interview_kit_patched' as never, {
        kitId: res.kit.id,
        reminded: res.kit.reminderScheduled,
      });
      queryClient.invalidateQueries({ queryKey: ['week-outfits'] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit'] });
    },
  });
}

export function useDeleteWardrobeItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWardrobeItem(sessionToken(), id),
    onSuccess: (_void, id) => {
      trackEvent('wardrobe_item_deleted', { itemId: id });
      queryClient.invalidateQueries({ queryKey: ['wardrobe'] });
      queryClient.invalidateQueries({ queryKey: ['waste-summary'] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit'] });
    },
  });
}

export function useTodayOutfit() {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('today-outfit', userId),
    queryFn: ({ signal }) => fetchTodayOutfit(sessionToken(), undefined, signal),
    enabled: Boolean(userId),
  });
}

/** Another look for today. Cached per `alt` with today's outfit, so going back is instant. */
export function useOutfitAlternative() {
  const userId = useSessionUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alt: number) =>
      queryClient.fetchQuery({
        queryKey: closetKey('today-outfit', userId, 'alt', alt),
        queryFn: ({ signal }) => fetchTodayOutfit(sessionToken(), { alt }, signal),
      }),
    onSuccess: () => {
      trackEvent('outfit_alt_viewed' as never);
    },
  });
}

export function useSelectTodayOutfit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { outfitId?: string; alt?: number }) => selectTodayOutfit(sessionToken(), body),
    onSuccess: () => {
      trackEvent('outfit_selected' as never);
      queryClient.invalidateQueries({ queryKey: ['today-outfit'] });
      queryClient.invalidateQueries({ queryKey: ['week-outfits'] });
    },
  });
}

export function useWeekOutfits() {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('week-outfits', userId),
    queryFn: ({ signal }) => fetchWeekOutfits(sessionToken(), undefined, signal),
    enabled: Boolean(userId),
  });
}

export function useGenerateWeekOutfit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { date?: string; fillWeek?: boolean; preferCapsule?: boolean } = {}) =>
      generateWeekOutfit(sessionToken(), body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['week-outfits'] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit'] });
    },
  });
}

/** W046 — tap-assign / drag-plan a look onto a week day. */
export function usePatchWeekOutfit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      date: string;
      itemIds?: string[];
      occasion?: string | null;
    }) =>
      patchWeekDayOutfit(sessionToken(), args.date, {
        itemIds: args.itemIds,
        occasion: args.occasion,
      }),
    onSuccess: () => {
      trackEvent('outfit_selected' as never);
      queryClient.invalidateQueries({ queryKey: ['week-outfits'] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit'] });
    },
  });
}

export function useGoesWith(itemId: string | null) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('goes-with', userId, itemId),
    queryFn: () => fetchGoesWith(sessionToken(), itemId!),
    enabled: Boolean(userId) && Boolean(itemId),
  });
}

/** N29 — shoe & bag rotation suggestions from wear_log. */
export function useShoeBagRotation(kind: 'shoes' | 'bag' | 'all' = 'all') {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('shoe-bag-rotation', userId, kind),
    queryFn: () => fetchShoeBagRotation(sessionToken(), { kind, limit: 6 }),
    enabled: Boolean(userId),
  });
}

/** N31 — missing-piece gaps → shopping list with affiliate URLs. */
export function useMissingPieces(limit = 5) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('missing-pieces', userId, limit),
    queryFn: () => fetchMissingPieces(sessionToken(), limit),
    enabled: Boolean(userId),
  });
}

/** W070 — photo dump → tagged wardrobe items for batch review. */
export function usePhotoDump() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { imageUris: string[] }) =>
      runPhotoDumpFromUris(sessionToken(), args.imageUris),
    onSuccess: (res) => {
      trackEvent('wardrobe_photo_dump', { count: res.created, tagged: res.tagged });
      queryClient.invalidateQueries({ queryKey: ['wardrobe'] });
    },
  });
}

/** N32 — capsule membership. */
export function useCapsule(opts?: { enabled?: boolean }) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('wardrobe-capsule', userId),
    queryFn: ({ signal }) => fetchCapsule(sessionToken(), signal),
    enabled: (opts?.enabled ?? true) && Boolean(userId),
  });
}

export function useSaveCapsule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemIds: string[]) => saveCapsule(sessionToken(), itemIds),
    onSuccess: () => {
      trackEvent('wardrobe_capsule_updated' as never);
      queryClient.invalidateQueries({ queryKey: ['wardrobe-capsule'] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit'] });
    },
  });
}

/** N51 — replace worn-out twin candidates. */
export function useReplaceTwins(itemId: string | null) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('replace-twins', userId, itemId),
    queryFn: () => fetchReplaceTwins(sessionToken(), itemId!),
    enabled: Boolean(userId) && Boolean(itemId),
  });
}

export function useReplaceTwinClick() {
  return useMutation({
    mutationFn: ({
      itemId,
      listingId,
      platform,
    }: {
      itemId: string;
      listingId: string;
      platform?: string;
    }) => recordReplaceTwinClick(sessionToken(), itemId, { listingId, platform }),
  });
}

/** N52 — complete-the-look owned + affiliate gaps. */
export function useCompleteLook(itemIds?: string[]) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('complete-look', userId, itemIds?.join(',') ?? 'auto'),
    queryFn: () => fetchCompleteLook(sessionToken(), itemIds),
    enabled: Boolean(userId),
  });
}

export function useLogWear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      wardrobeItemId?: string | null;
      outfitId?: string | null;
      imageKey?: string | null;
      /** Local image URI — uploaded via /wear/photo then attached as imageKey. */
      photoUri?: string | null;
      /** Prior wear count before this log (for challenge celebrate). */
      priorWearCount?: number;
    }) => {
      let imageKey = body.imageKey ?? null;
      if (!imageKey && body.photoUri) {
        const uploaded = await uploadWearPhoto(sessionToken(), body.photoUri);
        imageKey = uploaded.imageKey;
      }
      return logWear(sessionToken(), {
        wardrobeItemId: body.wardrobeItemId,
        outfitId: body.outfitId,
        imageKey,
      });
    },
    onSuccess: (_data, vars) => {
      trackEvent('wear_logged');
      const itemId = vars.wardrobeItemId ?? null;
      if (itemId) {
        const started = useClosetStore.getState().wearChallengeIds.includes(itemId);
        if (started) {
          const next = wearChallengeProgress((vars.priorWearCount ?? 0) + 1, 'ACTIVE', {
            started: true,
          });
          if (next.completed) {
            useClosetStore.getState().completeWearChallenge(itemId);
            trackEvent('wear_challenge_completed' as never);
          }
        }
      }
      queryClient.invalidateQueries({ queryKey: ['waste-summary'] });
      queryClient.invalidateQueries({ queryKey: ['waste-dead'] });
      queryClient.invalidateQueries({ queryKey: ['rewear-streak'] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit'] });
      queryClient.invalidateQueries({ queryKey: ['wardrobe'] });
    },
  });
}

export function useWasteSummary() {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('waste-summary', userId),
    queryFn: ({ signal }) => fetchWasteSummary(sessionToken(), signal),
    enabled: Boolean(userId),
  });
}

export function useRewearStreak(opts?: {
  breakOnPurchase?: boolean;
  enabled?: boolean;
}) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('rewear-streak', userId, opts?.breakOnPurchase ?? false),
    queryFn: () =>
      fetchRewearStreak(sessionToken(), {
        breakOnPurchase: opts?.breakOnPurchase,
      }),
    enabled: (opts?.enabled ?? true) && Boolean(userId),
  });
}

export function useWasteDead() {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('waste-dead', userId),
    queryFn: ({ signal }) => fetchWasteDead(sessionToken(), signal),
    enabled: Boolean(userId),
  });
}

export function useDisposeWaste() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, mode }: { itemId: string; mode?: string }) => disposeWasteItem(sessionToken(), itemId, { mode: mode ?? 'SELL' }),
    onSuccess: () => {
      trackEvent('waste_disposed');
      queryClient.invalidateQueries({ queryKey: ['waste-summary'] });
      queryClient.invalidateQueries({ queryKey: ['waste-dead'] });
      queryClient.invalidateQueries({ queryKey: ['disposition'] });
      // A disposed item leaves the active wardrobe (MOB 6).
      queryClient.invalidateQueries({ queryKey: ['wardrobe'] });
    },
  });
}

export function useStartWearChallenge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => startWearChallenge(sessionToken(), itemId),
    onSuccess: (data) => {
      useClosetStore.getState().startWearChallenge(data.wardrobeItemId);
      trackEvent('wear_challenge_started' as never, { wardrobeItemId: data.wardrobeItemId });
      queryClient.invalidateQueries({ queryKey: ['waste-summary'] });
      queryClient.invalidateQueries({ queryKey: ['waste-dead'] });
    },
  });
}

export function useStartDeclutterChallenge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (opts?: { target?: number }) => startDeclutterChallenge(sessionToken(), opts ?? {}),
    onSuccess: (data) => {
      useClosetStore.getState().startDeclutterChallenge();
      trackEvent('declutter_challenge_started' as never, {
        progress: data.declutterChallenge.progress,
        target: data.declutterChallenge.target,
      });
      queryClient.invalidateQueries({ queryKey: ['disposition'] });
      queryClient.invalidateQueries({ queryKey: ['waste-summary'] });
    },
  });
}

// --- Universe P3: accountant ---
export function useAccountantSummary(opts?: { enabled?: boolean }) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('accountant-summary', userId),
    queryFn: ({ signal }) => fetchAccountantSummary(sessionToken(), signal),
    enabled: Boolean(userId) && opts?.enabled !== false,
    subscribed: useClosetSubscribed(),
  });
}
export function useAccountantSeasonRoi(year?: number, opts?: { enabled?: boolean }) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('accountant-roi-season', userId, year ?? 'current'),
    queryFn: ({ signal }) => fetchAccountantSeasonRoi(sessionToken(), year, signal),
    enabled: Boolean(userId) && opts?.enabled !== false,
    subscribed: useClosetSubscribed(),
  });
}
export function useAccountantLedger(opts?: { enabled?: boolean }) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('accountant-ledger', userId),
    queryFn: ({ signal }) => fetchAccountantLedger(sessionToken(), signal),
    enabled: Boolean(userId) && opts?.enabled !== false,
    subscribed: useClosetSubscribed(),
  });
}
export function useBudgets(opts?: { enabled?: boolean }) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('budgets', userId),
    queryFn: ({ signal }) => fetchBudgets(sessionToken(), signal),
    enabled: Boolean(userId) && opts?.enabled !== false,
    subscribed: useClosetSubscribed(),
  });
}
export function useCreateBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { category: string; period: string; limitMinor: number }) => createBudget(sessionToken(), body),
    onSuccess: () => {
      trackEvent('budget_created');
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['accountant-summary'] });
    },
  });
}

export function useSetCpwGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, targetCpwMinor }: { itemId: string; targetCpwMinor: number }) =>
      setCpwGoal(sessionToken(), itemId, targetCpwMinor),
    onSuccess: (data) => {
      trackEvent('cpw_goal_set', {
        wardrobeItemId: data.wardrobeItemId,
        targetCpwMinor: data.targetCpwMinor,
      });
      queryClient.invalidateQueries({ queryKey: ['accountant-summary'] });
      queryClient.invalidateQueries({ queryKey: ['waste-summary'] });
      queryClient.invalidateQueries({ queryKey: ['waste-dead'] });
      queryClient.invalidateQueries({ queryKey: ['wardrobe'] });
    },
  });
}

export function useExportAccountantCsv() {
  return useMutation({
    mutationFn: async () => {
      const accessToken = sessionToken('Sign in to export');
      const csv = await fetchAccountantExportCsv(accessToken);
      const stamp = localDayKey();
      const result = await shareTextFile({
        fileName: `worn-accountant-${stamp}.csv`,
        contents: csv,
        mimeType: 'text/csv',
        dialogTitle: 'Export CSV',
      });
      trackEvent('accountant_exported');
      return { csv, ...result };
    },
  });
}

export function useExportVault() {
  return useMutation({
    mutationFn: async () => {
      const accessToken = sessionToken('Sign in to export');
      const data = await exportVaultData(accessToken);
      const stamp = localDayKey();
      const result = await shareTextFile({
        fileName: `worn-vault-export-${stamp}.json`,
        contents: JSON.stringify(data, null, 2),
        mimeType: 'application/json',
        dialogTitle: 'Export my data',
      });
      trackEvent('vault_export');
      return { data, ...result };
    },
  });
}

export function useDeleteVault() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const accessToken = sessionToken('Sign in to delete your account');
      await deleteVault(accessToken);
    },
    onSuccess: () => {
      trackEvent('vault_deleted');
      useSessionStore.getState().clear();
      queryClient.clear();
    },
  });
}

// --- Universe P3: returns ---
export function useReturns() {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('returns', userId),
    queryFn: ({ signal }) => fetchReturns(sessionToken(), signal),
    enabled: Boolean(userId),
    subscribed: useClosetSubscribed(),
  });
}
/** N16 — open refund ETA board (INITIATED→…→REFUNDED until ledger). */
export function useRefundEtaBoard(opts?: { all?: boolean }) {
  const userId = useSessionUserId();
  const all = opts?.all === true;
  return useQuery({
    queryKey: closetKey('refund-eta-board', userId, all ? 'all' : 'open'),
    queryFn: () =>
      fetchRefundEtaBoard(sessionToken(), { all }),
    enabled: Boolean(userId),
  });
}
export function useReturnDetail(id: string) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('return-detail', userId, id),
    queryFn: ({ signal }) => fetchReturnDetail(sessionToken(), id, signal),
    enabled: Boolean(userId) && Boolean(id),
  });
}
export function useInitiateReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      purchaseId?: string;
      purchaseItemId?: string;
      method?: string;
      reason?: string;
      orderedSize?: string;
      preferredSize?: string;
    }) => initiateReturn(sessionToken(), id, body),
    onSuccess: () => {
      trackEvent('return_initiated');
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      queryClient.invalidateQueries({ queryKey: ['return-detail'] });
      queryClient.invalidateQueries({ queryKey: ['refund-eta-board'] });
    },
  });
}
export function useConfirmReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tracking }: { id: string; tracking?: string }) => confirmReturn(sessionToken(), id, { tracking }),
    onSuccess: () => {
      trackEvent('return_confirmed');
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      queryClient.invalidateQueries({ queryKey: ['return-detail'] });
      queryClient.invalidateQueries({ queryKey: ['refund-eta-board'] });
    },
  });
}
/** WV01 / W033 — book logistics pickup slot. */
export function useBookReturnPickup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pickupSlotAt }: { id: string; pickupSlotAt: string }) =>
      bookReturnPickup(sessionToken(), id, { pickupSlotAt }),
    onSuccess: (_data, vars) => {
      trackEvent('return_pickup_scheduled', { returnId: vars.id });
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      queryClient.invalidateQueries({ queryKey: ['return-detail'] });
      queryClient.invalidateQueries({ queryKey: ['refund-eta-board'] });
    },
  });
}

function invalidateReturnQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['returns'] });
  queryClient.invalidateQueries({ queryKey: ['return-detail'] });
  queryClient.invalidateQueries({ queryKey: ['refund-eta-board'] });
}

/** U019 — reschedule pickup. */
export function useRescheduleReturnPickup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pickupSlotAt }: { id: string; pickupSlotAt: string }) =>
      rescheduleReturnPickup(sessionToken(), id, { pickupSlotAt }),
    onSuccess: (_data, vars) => {
      trackEvent('return_pickup_rescheduled', { returnId: vars.id });
      invalidateReturnQueries(queryClient);
    },
  });
}

/** U019 — cancel pickup → INITIATED. */
export function useCancelReturnPickup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => cancelReturnPickup(sessionToken(), id),
    onSuccess: (_data, vars) => {
      trackEvent('return_pickup_cancelled', { returnId: vars.id });
      invalidateReturnQueries(queryClient);
    },
  });
}

/** U020 — snooze refund chase. */
export function useSnoozeRefundChase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, days }: { id: string; days?: number }) =>
      snoozeRefundChase(sessionToken(), id, { days }),
    onSuccess: (_data, vars) => {
      trackEvent('return_chase_snoozed', { returnId: vars.id });
      invalidateReturnQueries(queryClient);
    },
  });
}

/** U020 — escalate refund chase. */
export function useEscalateRefundChase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => escalateRefundChase(sessionToken(), id),
    onSuccess: (_data, vars) => {
      trackEvent('return_chase_escalated', { returnId: vars.id });
      invalidateReturnQueries(queryClient);
    },
  });
}

/** U025 — correct return window. */
export function useCorrectReturnWindow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      windowDeadline,
      reason,
    }: {
      id: string;
      windowDeadline: string;
      reason: string;
    }) => correctReturnWindow(sessionToken(), id, { windowDeadline, reason }),
    onSuccess: (_data, vars) => {
      trackEvent('return_window_corrected', { returnId: vars.id });
      invalidateReturnQueries(queryClient);
    },
  });
}
/** N17 / W036 — brand size inconsistency map. */
export function useSizeMap() {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('returns-size-map', userId),
    queryFn: () => fetchSizeMap(sessionToken()),
    enabled: Boolean(userId),
  });
}
/** User marks merchant refund landed → money_ledger REFUND visible in Vault. */
export function useMarkReturnRefunded() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      refundMinor,
      destination,
    }: {
      id: string;
      refundMinor?: number;
      destination: 'ORIGINAL_CARD' | 'STORE_CREDIT' | 'UPI';
    }) => markReturnRefunded(sessionToken(), id, { refundMinor, destination }),
    onSuccess: () => {
      trackEvent('return_refunded');
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      queryClient.invalidateQueries({ queryKey: ['return-detail'] });
      queryClient.invalidateQueries({ queryKey: ['refund-eta-board'] });
      queryClient.invalidateQueries({ queryKey: ['accountant-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['gift-cards'] });
      queryClient.invalidateQueries({ queryKey: ['returns-size-map'] });
    },
  });
}

// --- Universe P4: gift ---
export function useRecipients() {
  const userId = useSessionUserId();
  return useQuery({ queryKey: closetKey('recipients', userId), queryFn: ({ signal }) => fetchRecipients(sessionToken(), signal), enabled: Boolean(userId) });
}
export function useCreateRecipient() {
  const qc = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useMutation({ mutationFn: (body: { name: string; relationship?: string; region?: string; profile?: any }) => createRecipient(sessionToken(), body), onSuccess: () => { trackEvent('recipient_created' as never); qc.invalidateQueries({ queryKey: ['recipients'] }); } });
}
export function useRecipientIdeas(recipientId: string) {
  const userId = useSessionUserId();
  return useQuery({ queryKey: closetKey('recipient-ideas', userId, recipientId), queryFn: ({ signal }) => fetchRecipientIdeas(sessionToken(), recipientId, undefined, signal), enabled: Boolean(userId) && Boolean(recipientId) });
}
export function useCreateGiftOrder() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { recipientId: string; listingId?: string; occasion?: string }) => createGiftOrder(sessionToken(), body), onSuccess: () => { trackEvent('gift_ordered' as never); qc.invalidateQueries({ queryKey: ['gifts'] }); } });
}

// --- Universe P4: fit ---
export function useMeasurements() {
  const userId = useSessionUserId();
  return useQuery({ queryKey: closetKey('measurements', userId), queryFn: ({ signal }) => fetchMeasurements(sessionToken(), signal), enabled: Boolean(userId) });
}
export function useCreateMeasurement() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { points: Record<string,number>; region?: string; unit?: string }) => createMeasurement(sessionToken(), body), onSuccess: () => { trackEvent('measurement_saved' as never); qc.invalidateQueries({ queryKey: ['measurements'] }); } });
}
export function useTemplates(region?: string) {
  const userId = useSessionUserId();
  return useQuery({ queryKey: closetKey('templates', userId, region), queryFn: ({ signal }) => fetchTemplates(sessionToken(), region, signal), enabled: Boolean(userId) });
}
export function useCreateTailoringOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      templateId: string;
      measurementProfileId?: string | null;
      selections?: Record<string, string>;
      fabricRef?: string;
      fabricPhotoKeys?: string[];
      tailorSellerId?: string | null;
    }) => createTailoringOrder(sessionToken(), body),
    onSuccess: () => {
      trackEvent('tailoring_ordered' as never);
      qc.invalidateQueries({ queryKey: ['tailoring-orders'] });
    },
  });
}
export function useReorderTailoringOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => reorderTailoringOrder(sessionToken(), orderId),
    onSuccess: () => {
      trackEvent('tailoring_reordered' as never);
      qc.invalidateQueries({ queryKey: ['tailoring-orders'] });
    },
  });
}
export function useTailoringOrder(id: string) {
  const userId = useSessionUserId();
  return useQuery({ queryKey: closetKey('tailoring-order', userId, id), queryFn: () => fetchTailoringOrder(sessionToken(), id), enabled: Boolean(userId) && Boolean(id) });
}
export function useTailoringOrders() {
  const userId = useSessionUserId();
  return useQuery({ queryKey: closetKey('tailoring-orders', userId), queryFn: () => fetchTailoringOrders(sessionToken()), enabled: Boolean(userId) });
}
export function useFitTailors() {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('fit-tailors', userId),
    queryFn: ({ signal }) => fetchFitTailors(sessionToken(), signal),
    enabled: Boolean(userId),
  });
}
export function useFitPreview() {
  return useMutation({
    mutationFn: (body: { templateId: string; selections?: Record<string, string> }) =>
      previewFitCustomization(sessionToken(), body),
    onSuccess: () => {
      trackEvent('tailoring_previewed' as never);
    },
  });
}

// --- Universe P4: disposition ---
export function useDisposition() {
  const userId = useSessionUserId();
  return useQuery({ queryKey: closetKey('disposition', userId), queryFn: () => fetchDisposition(sessionToken()), enabled: Boolean(userId) });
}
export function useCreateDisposition() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { wardrobeItemId: string; mode?: string; priceMinor?: number | null }) => createDisposition(sessionToken(), body), onSuccess: () => { trackEvent('disposition_created' as never); qc.invalidateQueries({ queryKey: ['disposition'] }); qc.invalidateQueries({ queryKey: ['waste-summary'] }); qc.invalidateQueries({ queryKey: ['waste-dead'] }); } });
}

/** N50 — Track this Play buy in Closet. */
export function useTrackPlayBuy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { orderId: string; seedWardrobe?: boolean }) => {
      const accessToken = sessionToken('Sign in to track this purchase');
      return trackPlayBuyInCloset(accessToken, body.orderId, body.seedWardrobe ?? true);
    },
    onSuccess: (result) => {
      trackEvent('play_buy_tracked' as never, {
        purchaseId: result.purchase.id,
        created: result.created,
        itemCount: result.items.length,
      });
      void qc.invalidateQueries({ queryKey: ['wardrobe'] });
      void qc.invalidateQueries({ queryKey: ['accountant-summary'] });
      void qc.invalidateQueries({ queryKey: ['ingestion-sources'] });
      void qc.invalidateQueries({ queryKey: ['ingestion-metrics'] });
    },
  });
}

/** N33 — Check my closet before Play checkout. */
export function usePrebuyFit() {
  return useMutation({
    mutationFn: (
      body:
        | { useCart: true }
        | { listingIds: string[] }
        | {
            candidates: Array<{
              title: string;
              category?: string | null;
              brand?: string | null;
              priceMinor: number;
            }>;
          },
    ) => {
      const accessToken = sessionToken('Sign in to check your closet');
      return checkPrebuyFit(accessToken, body);
    },
    onSuccess: (result) => {
      trackEvent('prebuy_fit_checked' as never, {
        score: result.score,
        softBlock: result.softBlock,
        overlapCount: result.overlaps.length,
      });
    },
  });
}

/** N09 — in-transit packages */
export function usePackages(all = false, opts?: { enabled?: boolean }) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('packages', userId, all),
    queryFn: ({ signal }) => fetchPackages(sessionToken(), all, signal),
    enabled: (opts?.enabled ?? true) && Boolean(userId),
  });
}

export function useMarkPackageDelivered() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, addToWardrobe }: { id: string; addToWardrobe?: boolean }) =>
      markPackageDelivered(sessionToken(), id, { addToWardrobe }),
    onSuccess: () => {
      trackEvent('package_delivered' as never);
      void qc.invalidateQueries({ queryKey: ['packages'] });
      void qc.invalidateQueries({ queryKey: ['exchanges'] });
      void qc.invalidateQueries({ queryKey: ['wardrobe'] });
    },
  });
}

/** U018 — paste tracking / set status. */
export function useUpdatePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      deliveryStatus?: string;
      trackingCode?: string | null;
      carrier?: string | null;
      deliveryAddressNote?: string | null;
    }) => updatePackage(sessionToken(), id, body),
    onSuccess: () => {
      trackEvent('package_tracking_saved' as never);
      void qc.invalidateQueries({ queryKey: ['packages'] });
      void qc.invalidateQueries({ queryKey: ['rto-recovery'] });
    },
  });
}

/** U023 — RTO address fix. */
export function useFixRtoAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      purchaseId,
      deliveryAddressNote,
      reattempt,
    }: {
      purchaseId: string;
      deliveryAddressNote: string;
      reattempt?: boolean;
    }) => fixRtoAddress(sessionToken(), purchaseId, { deliveryAddressNote, reattempt }),
    onSuccess: () => {
      trackEvent('rto_address_fixed' as never);
      void qc.invalidateQueries({ queryKey: ['packages'] });
      void qc.invalidateQueries({ queryKey: ['rto-recovery'] });
    },
  });
}

/** U024 — attach delivery proof. */
export function useAttachDeliveryProof() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ purchaseId, imageKey }: { purchaseId: string; imageKey: string }) =>
      attachDeliveryProof(sessionToken(), purchaseId, { imageKey }),
    onSuccess: () => {
      trackEvent('delivery_proof_attached' as never);
      void qc.invalidateQueries({ queryKey: ['packages'] });
      void qc.invalidateQueries({ queryKey: ['rto-recovery'] });
    },
  });
}

/** N10 — open exchange windows (≠ returns) */
export function useExchanges() {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('exchanges', userId),
    queryFn: ({ signal }) => fetchExchanges(sessionToken(), signal),
    enabled: Boolean(userId),
  });
}

/** N15 / W037 — RTO recovery checklist board */
export function useRtoRecovery(all = false) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('rto-recovery', userId, all),
    queryFn: () => fetchRtoRecovery(sessionToken(), all),
    enabled: Boolean(userId),
  });
}

export function useStartRtoRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ purchaseId, method }: { purchaseId: string; method?: string }) =>
      startRtoRefund(sessionToken(), purchaseId, { method }),
    onSuccess: () => {
      trackEvent('rto_refund_started');
      void qc.invalidateQueries({ queryKey: ['rto-recovery'] });
      void qc.invalidateQueries({ queryKey: ['returns'] });
      void qc.invalidateQueries({ queryKey: ['refund-eta-board'] });
      void qc.invalidateQueries({ queryKey: ['packages'] });
    },
  });
}

/** W038 — open a return from exchange dual CTA */
export function useCreateReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { purchaseId?: string; purchaseItemId?: string; method?: string }) =>
      createReturn(sessionToken(), body),
    onSuccess: () => {
      trackEvent('return_cta_from_exchange');
      void qc.invalidateQueries({ queryKey: ['returns'] });
      void qc.invalidateQueries({ queryKey: ['exchanges'] });
    },
  });
}

/** N37 — invite-only swap circles */
export function useSwapCircles() {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('swap-circles', userId),
    queryFn: ({ signal }) => fetchSwapCircles(sessionToken(), signal),
    enabled: Boolean(userId),
  });
}

export function useCreateSwapCircle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      createSwapCircle(sessionToken(), name),
    onSuccess: () => {
      trackEvent('swap_circle_created' as never);
      void qc.invalidateQueries({ queryKey: ['swap-circles'] });
    },
  });
}

export function useJoinSwapCircle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteCode: string) =>
      joinSwapCircle(sessionToken(), inviteCode),
    onSuccess: () => {
      trackEvent('swap_circle_joined' as never);
      void qc.invalidateQueries({ queryKey: ['swap-circles'] });
    },
  });
}

export function useSwapListings(circleId: string | null) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('swap-listings', userId, circleId),
    queryFn: () =>
      fetchSwapListings(sessionToken(), circleId!),
    enabled: Boolean(userId) && Boolean(circleId),
  });
}

export function useBorrowSwapListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ circleId, listingId }: { circleId: string; listingId: string }) =>
      borrowSwapListing(sessionToken(), circleId, listingId),
    onSuccess: () => {
      trackEvent('swap_listing_borrowed' as never);
      void qc.invalidateQueries({ queryKey: ['swap-listings'] });
    },
  });
}

/** N25 — lend / return */
export function useLentWardrobe(due: 'all' | 'due' | 'overdue' = 'overdue') {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('wardrobe-lent', userId, due),
    queryFn: () => fetchLentWardrobe(sessionToken(), { due }),
    enabled: Boolean(userId),
  });
}

export function useLendWardrobeItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, lentTo, dueOn }: { id: string; lentTo: string; dueOn: string }) =>
      lendWardrobeItem(sessionToken(), id, { lentTo, dueOn }),
    onSuccess: () => {
      trackEvent('wardrobe_lent' as never);
      void qc.invalidateQueries({ queryKey: ['wardrobe'] });
    },
  });
}

export function useReturnLentWardrobeItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      returnLentWardrobeItem(sessionToken(), id),
    onSuccess: () => {
      trackEvent('wardrobe_lent_returned' as never);
      void qc.invalidateQueries({ queryKey: ['wardrobe'] });
      void qc.invalidateQueries({ queryKey: ['wardrobe-lent'] });
    },
  });
}

/** N26 — household */
export function useHouseholds() {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('households', userId),
    queryFn: ({ signal }) => fetchHouseholds(sessionToken(), signal),
    enabled: Boolean(userId),
  });
}

export function useCreateHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      createHousehold(sessionToken(), name),
    onSuccess: () => {
      trackEvent('household_created' as never);
      void qc.invalidateQueries({ queryKey: ['households'] });
    },
  });
}

export function useJoinHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteCode: string) =>
      joinHousehold(sessionToken(), inviteCode),
    onSuccess: () => {
      trackEvent('household_joined' as never);
      void qc.invalidateQueries({ queryKey: ['households'] });
    },
  });
}

export function useHouseholdWardrobe(householdId: string | null) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('household-wardrobe', userId, householdId),
    queryFn: () =>
      fetchHouseholdWardrobe(sessionToken(), householdId!),
    enabled: Boolean(userId) && Boolean(householdId),
  });
}

/** U015 — shared vault (redacted; no card numbers). */
export function useHouseholdVault(householdId: string | null) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('household-vault', userId, householdId),
    queryFn: () => fetchHouseholdVault(sessionToken(), householdId!),
    enabled: Boolean(userId) && Boolean(householdId),
  });
}

export function usePatchHouseholdVaultMember(householdId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      userId: string;
      vaultAccess?: 'VIEW' | 'SPEND';
      spendCapMinor?: number | null;
    }) => patchHouseholdVaultMember(sessionToken(), householdId!, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['household-vault'] });
    },
  });
}

export function useSpendHouseholdVault(householdId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      accountId: string;
      amountMinor: number;
      idempotencyKey: string;
    }) => spendHouseholdVault(sessionToken(), householdId!, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['household-vault'] });
      void qc.invalidateQueries({ queryKey: ['gift-cards'] });
    },
  });
}

/** N27 — closet profiles */
export function useClosetProfiles() {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('closet-profiles', userId),
    queryFn: () => fetchClosetProfiles(sessionToken()),
    enabled: Boolean(userId),
  });
}

export function useCreateClosetProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; kind?: 'SELF' | 'PARTNER' | 'KID' | 'OTHER' }) =>
      createClosetProfile(sessionToken(), body),
    onSuccess: () => {
      trackEvent('closet_profile_created' as never);
      void qc.invalidateQueries({ queryKey: ['closet-profiles'] });
    },
  });
}

/** W065 — delete profile with confirm in UI. */
export function useDeleteClosetProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteClosetProfile(sessionToken(), id),
    onSuccess: () => {
      trackEvent('closet_profile_deleted' as never);
      void qc.invalidateQueries({ queryKey: ['closet-profiles'] });
      void qc.invalidateQueries({ queryKey: ['wardrobe'] });
    },
  });
}

/** W029 — scan owned-brand price drops for soft alert cards. */
export function usePriceDropScan(enabled = true) {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('price-drop-scan', userId),
    queryFn: () => scanPriceDrops(sessionToken()),
    enabled: Boolean(userId) && enabled,
    staleTime: 5 * 60_000,
  });
}

/** U008 — create / reinforce a brand price watch from the act card. */
export function useCreatePriceWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBrandPriceWatchBody) =>
      createBrandPriceWatch(sessionToken(), body),
    onSuccess: () => {
      trackEvent('price_watch_created');
      void qc.invalidateQueries({ queryKey: ['price-drop-scan'] });
    },
  });
}

/** W030 — active EMI plans for don’t-miss cards. */
export function useEmiPlans(status: 'ACTIVE' | 'PAID' | 'DEFAULTED' = 'ACTIVE') {
  const userId = useSessionUserId();
  return useQuery({
    queryKey: closetKey('emi-plans', userId, status),
    queryFn: () => fetchEmiPlans(sessionToken(), status),
    enabled: Boolean(userId),
  });
}

export function usePayEmi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; amountMinor?: number }) =>
      payEmiPlan(sessionToken(), input.id, { amountMinor: input.amountMinor }),
    onSuccess: () => {
      trackEvent('emi_marked_paid');
      void qc.invalidateQueries({ queryKey: ['emi-plans'] });
    },
  });
}

/** U007 — create EMI plan from pasted SMS text. */
export function useCreateEmiFromSms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; from?: string; subject?: string }) =>
      createEmiFromSms(sessionToken(), input),
    onSuccess: (plan) => {
      trackEvent('emi_from_sms', { planId: plan.id, provider: plan.provider });
      void qc.invalidateQueries({ queryKey: ['emi-plans'] });
    },
  });
}

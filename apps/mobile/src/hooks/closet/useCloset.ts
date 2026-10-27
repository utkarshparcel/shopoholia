import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
  fetchIngestionMetrics,
  fetchIngestionSources,
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
import type { CorrectIngestionDocumentBody, WardrobeItem } from '@/src/api/client';
import { useSessionStore } from '@/src/stores/session';
import { useClosetStore } from '@/src/stores/closet';
import { trackEvent } from '@/src/lib/analytics';
import { shareTextFile } from '@/src/lib/shareFile';
import { travelPackSharePayload } from '@/src/lib/todayOccasionWow';
import { wearChallengeProgress } from '@/src/lib/wearChallenge';

/**
 * TanStack Query namespace for the Closet surface.
 *
 * NOTE(C2 resolved): Closet data now fetches live ingestion status from the
 * WORN API (GET /ingestion/sources + GET /ingestion/metrics, auth-gated).
 * Mirrors src/hooks/catalog.ts conventions — reads the access token from the
 * shared session store and gates queries on it.
 */
export function useCloset() {
  const accessToken = useSessionStore((s) => s.accessToken);

  return useQuery({
    queryKey: ['closet', accessToken],
    queryFn: async () => {
      const [sourcesRes, metricsRes] = await Promise.all([
        fetchIngestionSources(accessToken!),
        fetchIngestionMetrics(accessToken!),
      ]);
      return {
        sources: sourcesRes.sources,
        metrics: metricsRes,
        connected: sourcesRes.sources.length > 0,
        coverage: metricsRes.coverage,
      };
    },
    enabled: Boolean(accessToken),
  });
}

export function useIngestionSources() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['ingestion-sources', accessToken],
    queryFn: () => fetchIngestionSources(accessToken!),
    enabled: Boolean(accessToken),
  });
}

export function useIngestionMetrics() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['ingestion-metrics', accessToken],
    queryFn: () => fetchIngestionMetrics(accessToken!),
    enabled: Boolean(accessToken),
  });
}

export function useIngestionActivity() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['ingestion-activity', accessToken],
    queryFn: () => fetchIngestionActivity(accessToken!),
    enabled: Boolean(accessToken),
  });
}

export function useCorrectIngestionDocument() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { documentId: string; body: CorrectIngestionDocumentBody }) =>
      correctIngestionDocument(accessToken!, input.documentId, input.body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ingestion-activity'] });
      void qc.invalidateQueries({ queryKey: ['ingestion-metrics'] });
      trackEvent('ingestion_corrected' as never);
    },
  });
}

/** Mute a merchant on the first EMAIL ingestion source (N47). */
export function useMuteMerchant() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (merchant: string) => {
      const { sources } = await fetchIngestionSources(accessToken!);
      const source =
        sources.find((s) => s.kind === 'EMAIL') ?? sources[0];
      if (!source) throw new Error('Connect email before muting merchants.');
      const prev =
        (source.meta as { mutedMerchants?: string[] } | null | undefined)?.mutedMerchants ??
        [];
      const next = Array.from(
        new Set([...prev.map((m) => m.trim()), merchant.trim()].filter(Boolean)),
      );
      return patchIngestionSource(accessToken!, source.id, { mutedMerchants: next });
    },
    onSuccess: (_data, merchant) => {
      void qc.invalidateQueries({ queryKey: ['ingestion-sources'] });
      void qc.invalidateQueries({ queryKey: ['ingestion-status'] });
      trackEvent('ingestion_merchant_muted' as never, { merchant });
    },
  });
}

/** N48 — list purchases with items for merge/split. */
export function usePurchases() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['purchases', accessToken],
    queryFn: () => fetchPurchases(accessToken!),
    enabled: Boolean(accessToken),
  });
}

export function useMergePurchases() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { targetPurchaseId: string; sourcePurchaseId: string }) =>
      mergePurchases(accessToken!, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['purchases'] });
      void qc.invalidateQueries({ queryKey: ['ingestion-activity'] });
      void qc.invalidateQueries({ queryKey: ['packages'] });
      trackEvent('purchases_merged');
    },
  });
}

export function useSplitPurchase() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { purchaseId: string; itemIds: string[]; merchant?: string }) =>
      splitPurchase(accessToken!, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['purchases'] });
      void qc.invalidateQueries({ queryKey: ['packages'] });
      trackEvent('purchases_split');
    },
  });
}

export function useIngestionStatus() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['ingestion-status', accessToken],
    queryFn: async () => {
      const [sourcesRes, metricsRes] = await Promise.all([
        fetchIngestionSources(accessToken!),
        fetchIngestionMetrics(accessToken!),
      ]);
      return {
        connected: sourcesRes.sources.length > 0,
        sourceCount: sourcesRes.sources.length,
        coverage: metricsRes.coverage,
        totalMessages: metricsRes.totalMessages,
        byKind: metricsRes.byKind,
        byMerchant: metricsRes.byMerchant,
      };
    },
    enabled: Boolean(accessToken),
  });
}

export function useGiftCards(kind?: MoneyAccountKind) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['gift-cards', accessToken, kind ?? 'all'],
    queryFn: () =>
      kind ? fetchCredits(accessToken!, { kind }) : fetchCredits(accessToken!),
    enabled: Boolean(accessToken),
  });
}

function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `idem-${Date.now()}`;
}

export function useAddGiftCard() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddCreditBody) =>
      addCredit(accessToken!, {
        ...input,
        idempotencyKey: input.idempotencyKey ?? newIdempotencyKey(),
      }),
    onSuccess: (account) => {
      trackEvent('credit_added', { accountId: account.id, kind: account.kind });
      queryClient.invalidateQueries({ queryKey: ['gift-cards', accessToken] });
    },
  });
}

export function useCaptureGiftCard() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useMutation({
    mutationFn: async (
      input:
        | { mode: 'barcode'; barcode: string }
        | { mode: 'photo'; imageUri: string; barcode?: string },
    ): Promise<CreditCaptureResponse> => {
      if (!accessToken) throw new Error('Sign in to capture a card');
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
  const accessToken = useSessionStore((s) => s.accessToken);
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
      const result = await spendCredit(accessToken!, id, {
        amountMinor,
        idempotencyKey: key,
      });
      return { ...result, idempotencyKey: key, amountMinor, id };
    },
    onSuccess: (result, vars) => {
      trackEvent('credit_spent', { accountId: vars.id, amountMinor: vars.amountMinor });
      queryClient.invalidateQueries({ queryKey: ['gift-cards', accessToken] });
    },
  });
}

/** U001 — undo partial spend within 60s. */
export function useUndoSpendGiftCard() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      idempotencyKey,
    }: {
      id: string;
      idempotencyKey: string;
    }) => undoSpendCredit(accessToken!, id, { idempotencyKey }),
    onSuccess: (_result, vars) => {
      trackEvent('credit_spend_undone', { accountId: vars.id });
      queryClient.invalidateQueries({ queryKey: ['gift-cards', accessToken] });
    },
  });
}

/** U002 — merge same-merchant credit twins. */
export function useMergeCredits() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { targetAccountId: string; sourceAccountId: string }) =>
      mergeCredits(accessToken!, body),
    onSuccess: (result) => {
      trackEvent('credits_merged', {
        targetAccountId: result.account.id,
        sourceAccountId: result.mergedFromId,
        transferredMinor: result.transferredMinor,
      });
      queryClient.invalidateQueries({ queryKey: ['gift-cards', accessToken] });
    },
  });
}

/** U003 — mark expiry checklist handled (snooze push 7d). */
export function useMarkCreditExpiryHandled() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useMutation({
    mutationFn: (id: string) => markCreditExpiryHandled(accessToken!, id),
    onSuccess: (_result, id) => {
      trackEvent('credit_expiry_handled', { accountId: id });
    },
  });
}

/** WV02-BALANCE-CHECK — API refresh or manual re-check hint. */
export function useBalanceCheck() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => checkCreditBalance(accessToken!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gift-cards', accessToken] });
    },
  });
}

/** WV02-BALANCE-CHECK — confirm user-verified merchant balance. */
export function useConfirmBalance() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      balanceMinor,
    }: {
      id: string;
      balanceMinor: number;
    }) =>
      confirmCreditBalance(accessToken!, id, {
        balanceMinor,
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: (_result, vars) => {
      trackEvent('credit_balance_confirmed', {
        accountId: vars.id,
        balanceMinor: vars.balanceMinor,
      });
      queryClient.invalidateQueries({ queryKey: ['gift-cards', accessToken] });
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
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['receipts', accessToken, query?.merchant, query?.from, query?.to, query?.gstin],
    queryFn: () => fetchReceipts(accessToken!, query),
    enabled: Boolean(accessToken),
  });
}

export function useExportReceipt() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useMutation({
    mutationFn: (input: { id: string; format: 'image' | 'pdf' }) =>
      exportReceipt(accessToken!, input.id, input.format),
    onSuccess: (res) => {
      trackEvent('receipt_exported' as never, { format: res.format });
    },
  });
}

export function useUploadReceipt() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (imageUri: string) => uploadReceipt(accessToken!, imageUri),
    onSuccess: (parsed) => {
      trackEvent('receipt_uploaded', { receiptId: parsed.id });
      queryClient.invalidateQueries({ queryKey: ['receipts', accessToken] });
    },
  });
}

export function useConfirmReceipt() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ConfirmReceiptBody }) =>
      confirmReceipt(accessToken!, id, body),
    onSuccess: (_result, vars) => {
      trackEvent('receipt_confirmed', { receiptId: vars.id });
      queryClient.invalidateQueries({ queryKey: ['receipts', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['warranties', accessToken] });
    },
  });
}

export function useWarranties() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['warranties', accessToken],
    queryFn: () => fetchWarranties(accessToken!),
    enabled: Boolean(accessToken),
  });
}

export function useClaimWarranty() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => claimWarranty(accessToken!, id),
    onSuccess: (result) => {
      trackEvent('warranty_claimed');
      queryClient.invalidateQueries({ queryKey: ['warranties', accessToken] });
      return result;
    },
  });
}

export function useUnclaimWarranty() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unclaimWarranty(accessToken!, id),
    onSuccess: () => {
      trackEvent('warranty_unclaimed' as never);
      queryClient.invalidateQueries({ queryKey: ['warranties', accessToken] });
    },
  });
}

export function useCashbackClaims(status?: 'UNCLAIMED' | 'CLAIMED' | 'EXPIRED') {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['cashback-claims', accessToken, status ?? 'all'],
    queryFn: () => fetchCashbackClaims(accessToken!, status),
    enabled: Boolean(accessToken),
  });
}

export function useCreateCashbackClaim() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof createCashbackClaim>[1]) =>
      createCashbackClaim(accessToken!, body),
    onSuccess: () => {
      trackEvent('cashback_claim_created');
      queryClient.invalidateQueries({ queryKey: ['cashback-claims', accessToken] });
    },
  });
}

export function useMarkCashbackClaimed() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markCashbackClaimed(accessToken!, id),
    onSuccess: () => {
      trackEvent('cashback_claim_marked');
      queryClient.invalidateQueries({ queryKey: ['cashback-claims', accessToken] });
    },
  });
}

export function useSnoozeWarranty() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useMutation({
    mutationFn: ({
      id,
      days,
      until,
    }: {
      id: string;
      days?: number;
      until?: string;
    }) => snoozeWarranty(accessToken!, id, { days, until }),
    onSuccess: () => {
      trackEvent('warranty_snoozed');
    },
  });
}

// --- Universe P2: wardrobe / outfits / waste ---
export function useWardrobe(
  profileId?: string | null,
  opts?: { enabled?: boolean },
) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['wardrobe', profileId ?? null, accessToken],
    queryFn: () => fetchWardrobe(accessToken!, profileId),
    enabled: (opts?.enabled ?? true) && Boolean(accessToken),
  });
}

export function useUploadWardrobeItem() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ imageUri, meta }: { imageUri: string; meta: { category: string; colors?: string[]; brand?: string | null; costMinor?: number } }) => uploadWardrobeItem(accessToken!, imageUri, meta),
    onSuccess: (item) => {
      trackEvent('wardrobe_item_added', { itemId: item.id });
      queryClient.invalidateQueries({ queryKey: ['wardrobe', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['waste-summary', accessToken] });
    },
  });
}

export function useBulkUploadWardrobe() {
  const accessToken = useSessionStore((s) => s.accessToken);
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
      uploadWardrobeItemsBulk(accessToken!, imageUris, meta, {
        onProgress,
        shouldCancel,
        perItemMeta,
      }),
    onSuccess: (res) => {
      trackEvent('wardrobe_bulk_imported', { count: res.created });
      queryClient.invalidateQueries({ queryKey: ['wardrobe', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['waste-summary', accessToken] });
    },
  });
}

export function useWardrobeFromPurchases() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (purchaseItemIds: string[]) => wardrobeFromPurchases(accessToken!, purchaseItemIds),
    onSuccess: (res) => {
      trackEvent('wardrobe_from_purchases', { count: res.created });
      queryClient.invalidateQueries({ queryKey: ['wardrobe', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['waste-summary', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['importable-purchases', accessToken] });
    },
  });
}

export function useImportablePurchases() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['importable-purchases', accessToken],
    queryFn: () =>
      fetchImportablePurchases(accessToken!),
    enabled: Boolean(accessToken),
  });
}

export function useWardrobeTryon() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useMutation({
    mutationFn: (id: string) => tryOnWardrobeItem(accessToken!, id),
    onSuccess: (_res, id) => trackEvent('wardrobe_tryon_requested', { itemId: id }),
  });
}

export function useUpdateWardrobeItem() {
  const accessToken = useSessionStore((s) => s.accessToken);
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
    }) => updateWardrobeItem(accessToken!, id, patch),
    onSuccess: (item) => {
      trackEvent('wardrobe_item_updated', {
        itemId: item.id,
        laundryStatus: item.laundryStatus,
        closetStatus: item.closetStatus,
      });
      queryClient.invalidateQueries({ queryKey: ['wardrobe', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit', accessToken] });
    },
  });
}

export function useCareOcrWardrobeItem() {
  const accessToken = useSessionStore((s) => s.accessToken);
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
        ? careOcrWardrobePhoto(accessToken!, id, imageUri)
        : careOcrWardrobeItem(accessToken!, id, { imageKey, ocrText }),
    onSuccess: (res) => {
      trackEvent('wardrobe_care_ocr', { itemId: res.itemId });
      queryClient.invalidateQueries({ queryKey: ['wardrobe', accessToken] });
    },
  });
}

export function useDryCleanDropOff() {
  const accessToken = useSessionStore((s) => s.accessToken);
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
    }) => dryCleanDropOff(accessToken!, id, { ticket, pickupOn }),
    onSuccess: (res) => {
      trackEvent('wardrobe_dry_clean_drop_off', { itemId: res.item.id, phase: res.phase });
      queryClient.invalidateQueries({ queryKey: ['wardrobe', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit', accessToken] });
    },
  });
}

export function useDryCleanConfirm() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dryCleanConfirm(accessToken!, id),
    onSuccess: (res) => {
      trackEvent('wardrobe_dry_clean_confirm', { itemId: res.item.id, phase: res.phase });
      queryClient.invalidateQueries({ queryKey: ['wardrobe', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit', accessToken] });
    },
  });
}

export function useSeasonalSwap() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { season: 'summer' | 'winter' | 'monsoon'; tagItemIds?: string[] }) =>
      seasonalSwapWardrobe(accessToken!, body),
    onSuccess: (res) => {
      trackEvent('wardrobe_seasonal_swap', { season: res.season, active: res.active, stored: res.stored });
      queryClient.invalidateQueries({ queryKey: ['wardrobe', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit', accessToken] });
    },
  });
}

export function useTravelPack() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useMutation({
    mutationFn: (body: { startDate: string; endDate: string; maxItems?: number }) =>
      buildTravelPack(accessToken!, body),
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
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { weekStart?: string; commit?: boolean; unique?: boolean } = {}) =>
      planWorkwearWeek(accessToken!, body),
    onSuccess: (res) => {
      trackEvent('workwear_rotation_planned', { days: res.days.length, unique: res.unique });
      queryClient.invalidateQueries({ queryKey: ['week-outfits', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit', accessToken] });
    },
  });
}

/** N03 — calendar events → occasion outfits (+ optional night-before reminder). */
export function useOutfitsFromCalendar() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      events: Array<{ id?: string; title?: string; startAt: string; endAt?: string }>;
      remindNightBefore?: boolean;
      commit?: boolean;
    }) => outfitsFromCalendar(accessToken!, body),
    onSuccess: (res) => {
      trackEvent('cal_event_outfit' as never, {
        count: res.events.length,
        occasions: res.events.map((e) => e.occasion).join(','),
      });
      queryClient.invalidateQueries({ queryKey: ['week-outfits', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit', accessToken] });
    },
  });
}

/** N39 — wedding / festival multi-day planner. */
export function useWeddingFestivalPlan() {
  const accessToken = useSessionStore((s) => s.accessToken);
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
    }) => planWeddingFestival(accessToken!, body),
    onSuccess: (res) => {
      trackEvent('wedding_festival_planned' as never, {
        kind: res.kind,
        dayCount: res.dayCount,
      });
      queryClient.invalidateQueries({ queryKey: ['week-outfits', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit', accessToken] });
    },
  });
}

/** N40 — save interview / ceremony kit. */
export function useSaveInterviewKit() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      kind?: 'interview' | 'ceremony';
      itemIds: string[];
      eventAt: string;
      remindNightBefore?: boolean;
      commit?: boolean;
    }) => saveInterviewKit(accessToken!, body),
    onSuccess: (res) => {
      trackEvent('interview_kit_saved' as never, {
        kind: res.kit.kind,
        reminded: res.kit.reminderScheduled,
      });
      queryClient.invalidateQueries({ queryKey: ['week-outfits', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit', accessToken] });
    },
  });
}

/** W056 — edit / cancel night-before reminder. */
export function usePatchInterviewKit() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      eventAt?: string;
      cancelReminder?: boolean;
      remindNightBefore?: boolean;
    }) => {
      const { id, ...body } = input;
      return patchInterviewKit(accessToken!, id, body);
    },
    onSuccess: (res) => {
      trackEvent('interview_kit_patched' as never, {
        kitId: res.kit.id,
        reminded: res.kit.reminderScheduled,
      });
      queryClient.invalidateQueries({ queryKey: ['week-outfits', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit', accessToken] });
    },
  });
}

export function useDeleteWardrobeItem() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWardrobeItem(accessToken!, id),
    onSuccess: (_void, id) => {
      trackEvent('wardrobe_item_deleted', { itemId: id });
      queryClient.invalidateQueries({ queryKey: ['wardrobe', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['waste-summary', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit', accessToken] });
    },
  });
}

export function useTodayOutfit() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['today-outfit', accessToken],
    queryFn: () => fetchTodayOutfit(accessToken!),
    enabled: Boolean(accessToken),
  });
}

export function useOutfitAlternative() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useMutation({
    mutationFn: async (alt: number) => fetchTodayOutfit(accessToken!, { alt }),
    onSuccess: () => {
      trackEvent('outfit_alt_viewed' as never);
    },
  });
}

export function useSelectTodayOutfit() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { outfitId?: string; alt?: number }) => selectTodayOutfit(accessToken!, body),
    onSuccess: () => {
      trackEvent('outfit_selected' as never);
      queryClient.invalidateQueries({ queryKey: ['today-outfit', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['week-outfits', accessToken] });
    },
  });
}

export function useWeekOutfits() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['week-outfits', accessToken],
    queryFn: () => fetchWeekOutfits(accessToken!),
    enabled: Boolean(accessToken),
  });
}

export function useGenerateWeekOutfit() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { date?: string; fillWeek?: boolean; preferCapsule?: boolean } = {}) =>
      generateWeekOutfit(accessToken!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['week-outfits', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit', accessToken] });
    },
  });
}

/** W046 — tap-assign / drag-plan a look onto a week day. */
export function usePatchWeekOutfit() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      date: string;
      itemIds?: string[];
      occasion?: string | null;
    }) =>
      patchWeekDayOutfit(accessToken!, args.date, {
        itemIds: args.itemIds,
        occasion: args.occasion,
      }),
    onSuccess: () => {
      trackEvent('outfit_selected' as never);
      queryClient.invalidateQueries({ queryKey: ['week-outfits', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit', accessToken] });
    },
  });
}

export function useGoesWith(itemId: string | null) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['goes-with', itemId, accessToken],
    queryFn: () => fetchGoesWith(accessToken!, itemId!),
    enabled: Boolean(accessToken) && Boolean(itemId),
  });
}

/** N29 — shoe & bag rotation suggestions from wear_log. */
export function useShoeBagRotation(kind: 'shoes' | 'bag' | 'all' = 'all') {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['shoe-bag-rotation', kind, accessToken],
    queryFn: () => fetchShoeBagRotation(accessToken!, { kind, limit: 6 }),
    enabled: Boolean(accessToken),
  });
}

/** N31 — missing-piece gaps → shopping list with affiliate URLs. */
export function useMissingPieces(limit = 5) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['missing-pieces', limit, accessToken],
    queryFn: () => fetchMissingPieces(accessToken!, limit),
    enabled: Boolean(accessToken),
  });
}

/** W070 — photo dump → tagged wardrobe items for batch review. */
export function usePhotoDump() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { imageUris: string[] }) =>
      runPhotoDumpFromUris(accessToken!, args.imageUris),
    onSuccess: (res) => {
      trackEvent('wardrobe_photo_dump', { count: res.created, tagged: res.tagged });
      queryClient.invalidateQueries({ queryKey: ['wardrobe', accessToken] });
    },
  });
}

/** N32 — capsule membership. */
export function useCapsule(opts?: { enabled?: boolean }) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['wardrobe-capsule', accessToken],
    queryFn: () => fetchCapsule(accessToken!),
    enabled: (opts?.enabled ?? true) && Boolean(accessToken),
  });
}

export function useSaveCapsule() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemIds: string[]) => saveCapsule(accessToken!, itemIds),
    onSuccess: () => {
      trackEvent('wardrobe_capsule_updated' as never);
      queryClient.invalidateQueries({ queryKey: ['wardrobe-capsule', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit', accessToken] });
    },
  });
}

/** N51 — replace worn-out twin candidates. */
export function useReplaceTwins(itemId: string | null) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['replace-twins', itemId, accessToken],
    queryFn: () => fetchReplaceTwins(accessToken!, itemId!),
    enabled: Boolean(accessToken) && Boolean(itemId),
  });
}

export function useReplaceTwinClick() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useMutation({
    mutationFn: ({
      itemId,
      listingId,
      platform,
    }: {
      itemId: string;
      listingId: string;
      platform?: string;
    }) => recordReplaceTwinClick(accessToken!, itemId, { listingId, platform }),
  });
}

/** N52 — complete-the-look owned + affiliate gaps. */
export function useCompleteLook(itemIds?: string[]) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['complete-look', itemIds?.join(',') ?? 'auto', accessToken],
    queryFn: () => fetchCompleteLook(accessToken!, itemIds),
    enabled: Boolean(accessToken),
  });
}

export function useLogWear() {
  const accessToken = useSessionStore((s) => s.accessToken);
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
        const uploaded = await uploadWearPhoto(accessToken!, body.photoUri);
        imageKey = uploaded.imageKey;
      }
      return logWear(accessToken!, {
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
      queryClient.invalidateQueries({ queryKey: ['waste-summary', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['waste-dead', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['rewear-streak', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['today-outfit', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['wardrobe', accessToken] });
    },
  });
}

export function useWasteSummary() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['waste-summary', accessToken],
    queryFn: () => fetchWasteSummary(accessToken!),
    enabled: Boolean(accessToken),
  });
}

export function useRewearStreak(opts?: {
  breakOnPurchase?: boolean;
  enabled?: boolean;
}) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['rewear-streak', accessToken, opts?.breakOnPurchase ?? false],
    queryFn: () =>
      fetchRewearStreak(accessToken!, {
        breakOnPurchase: opts?.breakOnPurchase,
      }),
    enabled: (opts?.enabled ?? true) && Boolean(accessToken),
  });
}

export function useWasteDead() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['waste-dead', accessToken],
    queryFn: () => fetchWasteDead(accessToken!),
    enabled: Boolean(accessToken),
  });
}

export function useDisposeWaste() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, mode }: { itemId: string; mode?: string }) => disposeWasteItem(accessToken!, itemId, { mode: mode ?? 'SELL' }),
    onSuccess: () => {
      trackEvent('waste_disposed');
      queryClient.invalidateQueries({ queryKey: ['waste-summary', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['waste-dead', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['disposition', accessToken] });
    },
  });
}

export function useStartWearChallenge() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => startWearChallenge(accessToken!, itemId),
    onSuccess: (data) => {
      useClosetStore.getState().startWearChallenge(data.wardrobeItemId);
      trackEvent('wear_challenge_started' as never, { wardrobeItemId: data.wardrobeItemId });
      queryClient.invalidateQueries({ queryKey: ['waste-summary', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['waste-dead', accessToken] });
    },
  });
}

export function useStartDeclutterChallenge() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (opts?: { target?: number }) => startDeclutterChallenge(accessToken!, opts ?? {}),
    onSuccess: (data) => {
      useClosetStore.getState().startDeclutterChallenge();
      trackEvent('declutter_challenge_started' as never, {
        progress: data.declutterChallenge.progress,
        target: data.declutterChallenge.target,
      });
      queryClient.invalidateQueries({ queryKey: ['disposition', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['waste-summary', accessToken] });
    },
  });
}

// --- Universe P3: accountant ---
export function useAccountantSummary() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['accountant-summary', accessToken],
    queryFn: () => fetchAccountantSummary(accessToken!),
    enabled: Boolean(accessToken),
  });
}
export function useAccountantSeasonRoi(year?: number) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['accountant-roi-season', accessToken, year ?? 'current'],
    queryFn: () => fetchAccountantSeasonRoi(accessToken!, year),
    enabled: Boolean(accessToken),
  });
}
export function useAccountantLedger() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['accountant-ledger', accessToken],
    queryFn: () => fetchAccountantLedger(accessToken!),
    enabled: Boolean(accessToken),
  });
}
export function useBudgets() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['budgets', accessToken],
    queryFn: () => fetchBudgets(accessToken!),
    enabled: Boolean(accessToken),
  });
}
export function useCreateBudget() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { category: string; period: string; limitMinor: number }) => createBudget(accessToken!, body),
    onSuccess: () => {
      trackEvent('budget_created');
      queryClient.invalidateQueries({ queryKey: ['budgets', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['accountant-summary', accessToken] });
    },
  });
}

export function useSetCpwGoal() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, targetCpwMinor }: { itemId: string; targetCpwMinor: number }) =>
      setCpwGoal(accessToken!, itemId, targetCpwMinor),
    onSuccess: (data) => {
      trackEvent('cpw_goal_set', {
        wardrobeItemId: data.wardrobeItemId,
        targetCpwMinor: data.targetCpwMinor,
      });
      queryClient.invalidateQueries({ queryKey: ['accountant-summary', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['waste-summary', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['waste-dead', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['wardrobe', accessToken] });
    },
  });
}

export function useExportAccountantCsv() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useMutation({
    mutationFn: async () => {
      if (!accessToken) throw new Error('Sign in to export');
      const csv = await fetchAccountantExportCsv(accessToken);
      const stamp = new Date().toISOString().slice(0, 10);
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
  const accessToken = useSessionStore((s) => s.accessToken);
  return useMutation({
    mutationFn: async () => {
      if (!accessToken) throw new Error('Sign in to export');
      const data = await exportVaultData(accessToken);
      const stamp = new Date().toISOString().slice(0, 10);
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
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!accessToken) throw new Error('Sign in to delete your account');
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
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['returns', accessToken],
    queryFn: () => fetchReturns(accessToken!),
    enabled: Boolean(accessToken),
  });
}
/** N16 — open refund ETA board (INITIATED→…→REFUNDED until ledger). */
export function useRefundEtaBoard(opts?: { all?: boolean }) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const all = opts?.all === true;
  return useQuery({
    queryKey: ['refund-eta-board', accessToken, all ? 'all' : 'open'],
    queryFn: () =>
      fetchRefundEtaBoard(accessToken!, { all }),
    enabled: Boolean(accessToken),
  });
}
export function useReturnDetail(id: string) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['return-detail', id, accessToken],
    queryFn: () => fetchReturnDetail(accessToken!, id),
    enabled: Boolean(accessToken) && Boolean(id),
  });
}
export function useInitiateReturn() {
  const accessToken = useSessionStore((s) => s.accessToken);
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
    }) => initiateReturn(accessToken!, id, body),
    onSuccess: (_data, vars) => {
      trackEvent('return_initiated');
      queryClient.invalidateQueries({ queryKey: ['returns', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['return-detail', vars.id, accessToken] });
      queryClient.invalidateQueries({ queryKey: ['refund-eta-board'] });
    },
  });
}
export function useConfirmReturn() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tracking }: { id: string; tracking?: string }) => confirmReturn(accessToken!, id, { tracking }),
    onSuccess: (_data, vars) => {
      trackEvent('return_confirmed');
      queryClient.invalidateQueries({ queryKey: ['returns', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['return-detail', vars.id, accessToken] });
      queryClient.invalidateQueries({ queryKey: ['refund-eta-board'] });
    },
  });
}
/** WV01 / W033 — book logistics pickup slot. */
export function useBookReturnPickup() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pickupSlotAt }: { id: string; pickupSlotAt: string }) =>
      bookReturnPickup(accessToken!, id, { pickupSlotAt }),
    onSuccess: (_data, vars) => {
      trackEvent('return_pickup_scheduled', { returnId: vars.id });
      queryClient.invalidateQueries({ queryKey: ['returns', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['return-detail', vars.id, accessToken] });
      queryClient.invalidateQueries({ queryKey: ['refund-eta-board'] });
    },
  });
}

function invalidateReturnQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  accessToken: string | null,
  id: string,
) {
  queryClient.invalidateQueries({ queryKey: ['returns', accessToken] });
  queryClient.invalidateQueries({ queryKey: ['return-detail', id, accessToken] });
  queryClient.invalidateQueries({ queryKey: ['refund-eta-board'] });
}

/** U019 — reschedule pickup. */
export function useRescheduleReturnPickup() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pickupSlotAt }: { id: string; pickupSlotAt: string }) =>
      rescheduleReturnPickup(accessToken!, id, { pickupSlotAt }),
    onSuccess: (_data, vars) => {
      trackEvent('return_pickup_rescheduled', { returnId: vars.id });
      invalidateReturnQueries(queryClient, accessToken, vars.id);
    },
  });
}

/** U019 — cancel pickup → INITIATED. */
export function useCancelReturnPickup() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => cancelReturnPickup(accessToken!, id),
    onSuccess: (_data, vars) => {
      trackEvent('return_pickup_cancelled', { returnId: vars.id });
      invalidateReturnQueries(queryClient, accessToken, vars.id);
    },
  });
}

/** U020 — snooze refund chase. */
export function useSnoozeRefundChase() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, days }: { id: string; days?: number }) =>
      snoozeRefundChase(accessToken!, id, { days }),
    onSuccess: (_data, vars) => {
      trackEvent('return_chase_snoozed', { returnId: vars.id });
      invalidateReturnQueries(queryClient, accessToken, vars.id);
    },
  });
}

/** U020 — escalate refund chase. */
export function useEscalateRefundChase() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => escalateRefundChase(accessToken!, id),
    onSuccess: (_data, vars) => {
      trackEvent('return_chase_escalated', { returnId: vars.id });
      invalidateReturnQueries(queryClient, accessToken, vars.id);
    },
  });
}

/** U025 — correct return window. */
export function useCorrectReturnWindow() {
  const accessToken = useSessionStore((s) => s.accessToken);
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
    }) => correctReturnWindow(accessToken!, id, { windowDeadline, reason }),
    onSuccess: (_data, vars) => {
      trackEvent('return_window_corrected', { returnId: vars.id });
      invalidateReturnQueries(queryClient, accessToken, vars.id);
    },
  });
}
/** N17 / W036 — brand size inconsistency map. */
export function useSizeMap() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['returns-size-map', accessToken],
    queryFn: () => fetchSizeMap(accessToken!),
    enabled: Boolean(accessToken),
  });
}
/** User marks merchant refund landed → money_ledger REFUND visible in Vault. */
export function useMarkReturnRefunded() {
  const accessToken = useSessionStore((s) => s.accessToken);
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
    }) => markReturnRefunded(accessToken!, id, { refundMinor, destination }),
    onSuccess: (_data, vars) => {
      trackEvent('return_refunded');
      queryClient.invalidateQueries({ queryKey: ['returns', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['return-detail', vars.id, accessToken] });
      queryClient.invalidateQueries({ queryKey: ['refund-eta-board'] });
      queryClient.invalidateQueries({ queryKey: ['accountant-ledger', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['gift-cards', accessToken] });
      queryClient.invalidateQueries({ queryKey: ['returns-size-map'] });
    },
  });
}

// --- Universe P4: gift ---
export function useRecipients() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: ['recipients', accessToken], queryFn: () => fetchRecipients(accessToken!), enabled: Boolean(accessToken) });
}
export function useCreateRecipient() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useMutation({ mutationFn: (body: { name: string; relationship?: string; region?: string; profile?: any }) => createRecipient(accessToken!, body), onSuccess: () => { trackEvent('recipient_created' as never); qc.invalidateQueries({ queryKey: ['recipients', accessToken] }); } });
}
export function useRecipientIdeas(recipientId: string) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: ['recipient-ideas', recipientId, accessToken], queryFn: () => fetchRecipientIdeas(accessToken!, recipientId), enabled: Boolean(accessToken) && Boolean(recipientId) });
}
export function useCreateGiftOrder() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { recipientId: string; listingId?: string; occasion?: string }) => createGiftOrder(accessToken!, body), onSuccess: () => { trackEvent('gift_ordered' as never); qc.invalidateQueries({ queryKey: ['gifts', accessToken] }); } });
}

// --- Universe P4: fit ---
export function useMeasurements() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: ['measurements', accessToken], queryFn: () => fetchMeasurements(accessToken!), enabled: Boolean(accessToken) });
}
export function useCreateMeasurement() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { points: Record<string,number>; region?: string; unit?: string }) => createMeasurement(accessToken!, body), onSuccess: () => { trackEvent('measurement_saved' as never); qc.invalidateQueries({ queryKey: ['measurements', accessToken] }); } });
}
export function useTemplates(region?: string) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: ['templates', region, accessToken], queryFn: () => fetchTemplates(accessToken!, region), enabled: Boolean(accessToken) });
}
export function useCreateTailoringOrder() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      templateId: string;
      measurementProfileId?: string | null;
      selections?: Record<string, string>;
      fabricRef?: string;
      fabricPhotoKeys?: string[];
      tailorSellerId?: string | null;
    }) => createTailoringOrder(accessToken!, body),
    onSuccess: () => {
      trackEvent('tailoring_ordered' as never);
      qc.invalidateQueries({ queryKey: ['tailoring-orders', accessToken] });
    },
  });
}
export function useReorderTailoringOrder() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => reorderTailoringOrder(accessToken!, orderId),
    onSuccess: () => {
      trackEvent('tailoring_reordered' as never);
      qc.invalidateQueries({ queryKey: ['tailoring-orders', accessToken] });
    },
  });
}
export function useTailoringOrder(id: string) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: ['tailoring-order', id, accessToken], queryFn: () => fetchTailoringOrder(accessToken!, id), enabled: Boolean(accessToken) && Boolean(id) });
}
export function useTailoringOrders() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: ['tailoring-orders', accessToken], queryFn: () => fetchTailoringOrders(accessToken!), enabled: Boolean(accessToken) });
}
export function useFitTailors() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['fit-tailors', accessToken],
    queryFn: () => fetchFitTailors(accessToken!),
    enabled: Boolean(accessToken),
  });
}
export function useFitPreview() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useMutation({
    mutationFn: (body: { templateId: string; selections?: Record<string, string> }) =>
      previewFitCustomization(accessToken!, body),
    onSuccess: () => {
      trackEvent('tailoring_previewed' as never);
    },
  });
}

// --- Universe P4: disposition ---
export function useDisposition() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: ['disposition', accessToken], queryFn: () => fetchDisposition(accessToken!), enabled: Boolean(accessToken) });
}
export function useCreateDisposition() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { wardrobeItemId: string; mode?: string; priceMinor?: number | null }) => createDisposition(accessToken!, body), onSuccess: () => { trackEvent('disposition_created' as never); qc.invalidateQueries({ queryKey: ['disposition', accessToken] }); qc.invalidateQueries({ queryKey: ['waste-summary', accessToken] }); qc.invalidateQueries({ queryKey: ['waste-dead', accessToken] }); } });
}

/** N50 — Track this Play buy in Closet. */
export function useTrackPlayBuy() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { orderId: string; seedWardrobe?: boolean }) => {
      if (!accessToken) throw new Error('Sign in to track this purchase');
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
      void qc.invalidateQueries({ queryKey: ['closet'] });
    },
  });
}

/** N33 — Check my closet before Play checkout. */
export function usePrebuyFit() {
  const accessToken = useSessionStore((s) => s.accessToken);
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
      if (!accessToken) throw new Error('Sign in to check your closet');
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
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['packages', all, accessToken],
    queryFn: () => fetchPackages(accessToken!, all),
    enabled: (opts?.enabled ?? true) && Boolean(accessToken),
  });
}

export function useMarkPackageDelivered() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, addToWardrobe }: { id: string; addToWardrobe?: boolean }) =>
      markPackageDelivered(accessToken!, id, { addToWardrobe }),
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
  const accessToken = useSessionStore((s) => s.accessToken);
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
    }) => updatePackage(accessToken!, id, body),
    onSuccess: () => {
      trackEvent('package_tracking_saved' as never);
      void qc.invalidateQueries({ queryKey: ['packages'] });
      void qc.invalidateQueries({ queryKey: ['rto-recovery'] });
    },
  });
}

/** U023 — RTO address fix. */
export function useFixRtoAddress() {
  const accessToken = useSessionStore((s) => s.accessToken);
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
    }) => fixRtoAddress(accessToken!, purchaseId, { deliveryAddressNote, reattempt }),
    onSuccess: () => {
      trackEvent('rto_address_fixed' as never);
      void qc.invalidateQueries({ queryKey: ['packages'] });
      void qc.invalidateQueries({ queryKey: ['rto-recovery'] });
    },
  });
}

/** U024 — attach delivery proof. */
export function useAttachDeliveryProof() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ purchaseId, imageKey }: { purchaseId: string; imageKey: string }) =>
      attachDeliveryProof(accessToken!, purchaseId, { imageKey }),
    onSuccess: () => {
      trackEvent('delivery_proof_attached' as never);
      void qc.invalidateQueries({ queryKey: ['packages'] });
      void qc.invalidateQueries({ queryKey: ['rto-recovery'] });
    },
  });
}

/** N10 — open exchange windows (≠ returns) */
export function useExchanges() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['exchanges', accessToken],
    queryFn: () => fetchExchanges(accessToken!),
    enabled: Boolean(accessToken),
  });
}

/** N15 / W037 — RTO recovery checklist board */
export function useRtoRecovery(all = false) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['rto-recovery', all, accessToken],
    queryFn: () => fetchRtoRecovery(accessToken!, all),
    enabled: Boolean(accessToken),
  });
}

export function useStartRtoRefund() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ purchaseId, method }: { purchaseId: string; method?: string }) =>
      startRtoRefund(accessToken!, purchaseId, { method }),
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
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { purchaseId?: string; purchaseItemId?: string; method?: string }) =>
      createReturn(accessToken!, body),
    onSuccess: () => {
      trackEvent('return_cta_from_exchange');
      void qc.invalidateQueries({ queryKey: ['returns'] });
      void qc.invalidateQueries({ queryKey: ['exchanges'] });
    },
  });
}

/** N37 — invite-only swap circles */
export function useSwapCircles() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['swap-circles', accessToken],
    queryFn: () => fetchSwapCircles(accessToken!),
    enabled: Boolean(accessToken),
  });
}

export function useCreateSwapCircle() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      createSwapCircle(accessToken!, name),
    onSuccess: () => {
      trackEvent('swap_circle_created' as never);
      void qc.invalidateQueries({ queryKey: ['swap-circles', accessToken] });
    },
  });
}

export function useJoinSwapCircle() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteCode: string) =>
      joinSwapCircle(accessToken!, inviteCode),
    onSuccess: () => {
      trackEvent('swap_circle_joined' as never);
      void qc.invalidateQueries({ queryKey: ['swap-circles', accessToken] });
    },
  });
}

export function useSwapListings(circleId: string | null) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['swap-listings', circleId, accessToken],
    queryFn: () =>
      fetchSwapListings(accessToken!, circleId!),
    enabled: Boolean(accessToken) && Boolean(circleId),
  });
}

export function useBorrowSwapListing() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ circleId, listingId }: { circleId: string; listingId: string }) =>
      borrowSwapListing(accessToken!, circleId, listingId),
    onSuccess: (_d, vars) => {
      trackEvent('swap_listing_borrowed' as never);
      void qc.invalidateQueries({ queryKey: ['swap-listings', vars.circleId, accessToken] });
    },
  });
}

/** N25 — lend / return */
export function useLentWardrobe(due: 'all' | 'due' | 'overdue' = 'overdue') {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['wardrobe-lent', due, accessToken],
    queryFn: () => fetchLentWardrobe(accessToken!, { due }),
    enabled: Boolean(accessToken),
  });
}

export function useLendWardrobeItem() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, lentTo, dueOn }: { id: string; lentTo: string; dueOn: string }) =>
      lendWardrobeItem(accessToken!, id, { lentTo, dueOn }),
    onSuccess: () => {
      trackEvent('wardrobe_lent' as never);
      void qc.invalidateQueries({ queryKey: ['wardrobe'] });
    },
  });
}

export function useReturnLentWardrobeItem() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      returnLentWardrobeItem(accessToken!, id),
    onSuccess: () => {
      trackEvent('wardrobe_lent_returned' as never);
      void qc.invalidateQueries({ queryKey: ['wardrobe'] });
      void qc.invalidateQueries({ queryKey: ['wardrobe-lent'] });
    },
  });
}

/** N26 — household */
export function useHouseholds() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['households', accessToken],
    queryFn: () => fetchHouseholds(accessToken!),
    enabled: Boolean(accessToken),
  });
}

export function useCreateHousehold() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      createHousehold(accessToken!, name),
    onSuccess: () => {
      trackEvent('household_created' as never);
      void qc.invalidateQueries({ queryKey: ['households', accessToken] });
    },
  });
}

export function useJoinHousehold() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteCode: string) =>
      joinHousehold(accessToken!, inviteCode),
    onSuccess: () => {
      trackEvent('household_joined' as never);
      void qc.invalidateQueries({ queryKey: ['households', accessToken] });
    },
  });
}

export function useHouseholdWardrobe(householdId: string | null) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['household-wardrobe', householdId, accessToken],
    queryFn: () =>
      fetchHouseholdWardrobe(accessToken!, householdId!),
    enabled: Boolean(accessToken) && Boolean(householdId),
  });
}

/** U015 — shared vault (redacted; no card numbers). */
export function useHouseholdVault(householdId: string | null) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['household-vault', householdId, accessToken],
    queryFn: () => fetchHouseholdVault(accessToken!, householdId!),
    enabled: Boolean(accessToken) && Boolean(householdId),
  });
}

export function usePatchHouseholdVaultMember(householdId: string | null) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      userId: string;
      vaultAccess?: 'VIEW' | 'SPEND';
      spendCapMinor?: number | null;
    }) => patchHouseholdVaultMember(accessToken!, householdId!, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['household-vault', householdId, accessToken] });
    },
  });
}

export function useSpendHouseholdVault(householdId: string | null) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      accountId: string;
      amountMinor: number;
      idempotencyKey: string;
    }) => spendHouseholdVault(accessToken!, householdId!, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['household-vault', householdId, accessToken] });
      void qc.invalidateQueries({ queryKey: ['gift-cards', accessToken] });
    },
  });
}

/** N27 — closet profiles */
export function useClosetProfiles() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['closet-profiles', accessToken],
    queryFn: () => fetchClosetProfiles(accessToken!),
    enabled: Boolean(accessToken),
  });
}

export function useCreateClosetProfile() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; kind?: 'SELF' | 'PARTNER' | 'KID' | 'OTHER' }) =>
      createClosetProfile(accessToken!, body),
    onSuccess: () => {
      trackEvent('closet_profile_created' as never);
      void qc.invalidateQueries({ queryKey: ['closet-profiles', accessToken] });
    },
  });
}

/** W065 — delete profile with confirm in UI. */
export function useDeleteClosetProfile() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteClosetProfile(accessToken!, id),
    onSuccess: () => {
      trackEvent('closet_profile_deleted' as never);
      void qc.invalidateQueries({ queryKey: ['closet-profiles', accessToken] });
      void qc.invalidateQueries({ queryKey: ['wardrobe', accessToken] });
    },
  });
}

/** W029 — scan owned-brand price drops for soft alert cards. */
export function usePriceDropScan(enabled = true) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['price-drop-scan', accessToken],
    queryFn: () => scanPriceDrops(accessToken!),
    enabled: Boolean(accessToken) && enabled,
    staleTime: 5 * 60_000,
  });
}

/** U008 — create / reinforce a brand price watch from the act card. */
export function useCreatePriceWatch() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBrandPriceWatchBody) =>
      createBrandPriceWatch(accessToken!, body),
    onSuccess: () => {
      trackEvent('price_watch_created');
      void qc.invalidateQueries({ queryKey: ['price-drop-scan', accessToken] });
    },
  });
}

/** W030 — active EMI plans for don’t-miss cards. */
export function useEmiPlans(status: 'ACTIVE' | 'PAID' | 'DEFAULTED' = 'ACTIVE') {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['emi-plans', accessToken, status],
    queryFn: () => fetchEmiPlans(accessToken!, status),
    enabled: Boolean(accessToken),
  });
}

export function usePayEmi() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; amountMinor?: number }) =>
      payEmiPlan(accessToken!, input.id, { amountMinor: input.amountMinor }),
    onSuccess: () => {
      trackEvent('emi_marked_paid');
      void qc.invalidateQueries({ queryKey: ['emi-plans', accessToken] });
    },
  });
}

/** U007 — create EMI plan from pasted SMS text. */
export function useCreateEmiFromSms() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; from?: string; subject?: string }) =>
      createEmiFromSms(accessToken!, input),
    onSuccess: (plan) => {
      trackEvent('emi_from_sms', { planId: plan.id, provider: plan.provider });
      void qc.invalidateQueries({ queryKey: ['emi-plans', accessToken] });
    },
  });
}

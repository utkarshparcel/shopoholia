import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  useAddGiftCard,
  useAccountantSeasonRoi,
  useBalanceCheck,
  useBorrowSwapListing,
  useBudgets,
  useBulkUploadWardrobe,
  useCapsule,
  useCaptureGiftCard,
  useCareOcrWardrobeItem,
  useCashbackClaims,
  useClaimWarranty,
  useCloset,
  useClosetProfiles,
  useCompleteLook,
  useConfirmBalance,
  useConfirmReceipt,
  useConfirmReturn,
  useCorrectIngestionDocument,
  useCreateBudget,
  useCreateCashbackClaim,
  useCreateClosetProfile,
  useCreateDisposition,
  useCreateEmiFromSms,
  useCreateGiftOrder,
  useCreateHousehold,
  useCreateMeasurement,
  useCreatePriceWatch,
  useCreateRecipient,
  useCreateReturn,
  useCreateSwapCircle,
  useCreateTailoringOrder,
  useDeleteClosetProfile,
  useDeleteVault,
  useDeleteWardrobeItem,
  useBookReturnPickup,
  useDisposition,
  useDisposeWaste,
  useDryCleanConfirm,
  useDryCleanDropOff,
  useEmiPlans,
  useExchanges,
  useExportAccountantCsv,
  useExportReceipt,
  useExportVault,
  useFitPreview,
  useFitTailors,
  useGenerateWeekOutfit,
  useGiftCards,
  useGoesWith,
  useHouseholdWardrobe,
  useHouseholdVault,
  useHouseholds,
  useImportablePurchases,
  useInitiateReturn,
  useIngestionActivity,
  useIngestionMetrics,
  useIngestionSources,
  useIngestionStatus,
  useJoinHousehold,
  useJoinSwapCircle,
  useLendWardrobeItem,
  useLentWardrobe,
  useLogWear,
  useMarkCashbackClaimed,
  useMarkCreditExpiryHandled,
  useMarkPackageDelivered,
  useMarkReturnRefunded,
  useMeasurements,
  useMergeCredits,
  useMergePurchases,
  useMissingPieces,
  useMuteMerchant,
  useOutfitAlternative,
  useOutfitsFromCalendar,
  usePackages,
  usePatchHouseholdVaultMember,
  usePatchInterviewKit,
  usePatchWeekOutfit,
  usePayEmi,
  usePhotoDump,
  usePrebuyFit,
  usePriceDropScan,
  usePurchases,
  useReceipts,
  useRecipientIdeas,
  useRecipients,
  useRefundEtaBoard,
  useReorderTailoringOrder,
  useReplaceTwinClick,
  useReplaceTwins,
  useReturnDetail,
  useReturnLentWardrobeItem,
  useReturns,
  useRewearStreak,
  useRtoRecovery,
  useSaveCapsule,
  useSaveInterviewKit,
  useSeasonalSwap,
  useSelectTodayOutfit,
  useSetCpwGoal,
  useShoeBagRotation,
  useSizeMap,
  useSnoozeWarranty,
  useSpendGiftCard,
  useSpendHouseholdVault,
  useSplitPurchase,
  useStartDeclutterChallenge,
  useStartRtoRefund,
  useStartWearChallenge,
  useSwapCircles,
  useSwapListings,
  useTailoringOrder,
  useTailoringOrders,
  useTemplates,
  useTodayOutfit,
  useTrackPlayBuy,
  useTravelPack,
  useUnclaimWarranty,
  useUndoSpendGiftCard,
  useUpdateWardrobeItem,
  useUploadReceipt,
  useUploadWardrobeItem,
  useWardrobe,
  useWardrobeFromPurchases,
  useWardrobeTryon,
  useWarranties,
  useWeddingFestivalPlan,
  useWeekOutfits,
  useWorkwearRotation,
  useAccountantLedger,
  useBulkUpdateWardrobe,
  useAccountantSummary,
  useWasteDead,
  useWasteSummary,
} from './useCloset';
import {
  addCredit,
  buildTravelPack,
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
  createBudget,
  createBrandPriceWatch,
  createCashbackClaim,
  createDisposition,
  createEmiFromSms,
  createGiftOrder,
  createRecipient,
  createReturn,
  deleteClosetProfile,
  deleteVault,
  deleteWardrobeItem,
  disposeWasteItem,
  dryCleanConfirm,
  dryCleanDropOff,
  exportVaultData,
  fetchAccountantExportCsv,
  fetchAccountantLedger,
  fetchAccountantSummary,
  fetchBudgets,
  fetchCapsule,
  fetchCompleteLook,
  fetchCredits,
  fetchEmiPlans,
  fetchExchanges,
  fetchGoesWith,
  fetchHouseholdVault,
  fetchIngestionMetrics,
  fetchIngestionSources,
  fetchLentWardrobe,
  fetchMissingPieces,
  fetchPackages,
  fetchPurchases,
  fetchReceipts,
  fetchRecipients,
  fetchReplaceTwins,
  fetchReturns,
  fetchReturnDetail,
  fetchRewearStreak,
  fetchRtoRecovery,
  fetchShoeBagRotation,
  fetchSizeMap,
  fetchTodayOutfit,
  fetchWardrobe,
  bulkUpdateWardrobeItems,
  fetchWarranties,
  fetchWasteDead,
  fetchWasteSummary,
  fetchWeekOutfits,
  generateWeekOutfit,
  patchInterviewKit,
  patchWeekDayOutfit,
  initiateReturn,
  logWear,
  markCashbackClaimed,
  markCreditExpiryHandled,
  markPackageDelivered,
  markReturnRefunded,
  mergeCredits,
  mergePurchases,
  outfitsFromCalendar,
  patchHouseholdVaultMember,
  patchIngestionSource,
  payEmiPlan,
  planWeddingFestival,
  planWorkwearWeek,
  recordReplaceTwinClick,
  runPhotoDumpFromUris,
  saveCapsule,
  saveInterviewKit,
  scanPriceDrops,
  seasonalSwapWardrobe,
  selectTodayOutfit,
  setCpwGoal,
  snoozeWarranty,
  spendCredit,
  spendHouseholdVault,
  splitPurchase,
  startDeclutterChallenge,
  startRtoRefund,
  startWearChallenge,
  trackPlayBuyInCloset,
  tryOnWardrobeItem,
  unclaimWarranty,
  undoSpendCredit,
  updateWardrobeItem,
  uploadReceipt,
  uploadWardrobeItem,
  uploadWardrobeItemsBulk,
  uploadWearPhoto,
  wardrobeFromPurchases,
  bookReturnPickup,
} from '@/src/api/client';
import { shareTextFile } from '@/src/lib/shareFile';
import { useClosetStore } from '@/src/stores/closet';
import { ClosetScreenFocus } from './keys';

const sessionState = vi.hoisted(() => ({
  accessToken: 'test-token' as string | null,
  clear: vi.fn(),
}));

vi.mock('@/src/stores/session', () => ({
  useSessionStore: Object.assign(
    (selector: (s: typeof sessionState) => unknown) => selector(sessionState),
    { getState: () => sessionState },
  ),
}));

// Queries are keyed by the user id in the token; any token here belongs to one test user.
vi.mock('@/src/lib/access-token', () => ({
  userIdFromAccessToken: (token: string | null) => (token ? 'user-1' : null),
}));

vi.mock('@/src/lib/shareFile', () => ({
  shareTextFile: vi.fn(async () => ({ shared: true, uri: 'file://export' })),
}));

vi.mock('@/src/api/client', () => ({
  ApiRequestError: class ApiRequestError extends Error {
    constructor(
      public status: number,
      message: string,
      public code: string | null = null,
    ) {
      super(message);
    }
  },
  fetchCredits: vi.fn(async () => ({
    accounts: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        userId: '22222222-2222-4222-8222-222222222222',
        kind: 'GIFT_CARD',
        merchant: 'Amazon',
        currency: 'INR',
        balanceCacheMinor: 5000,
        expiresAt: null,
        status: 'ACTIVE',
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        userId: '22222222-2222-4222-8222-222222222222',
        kind: 'STORE_CREDIT',
        merchant: 'Myntra',
        currency: 'INR',
        balanceCacheMinor: 1200,
        expiresAt: null,
        status: 'ACTIVE',
      },
    ],
  })),
  captureCreditBarcode: vi.fn(async () => ({
    merchant: 'Amazon',
    code: 'AMZNGC99887766',
    last4: '7766',
    suggestedBalanceMinor: null,
    confidence: 0.9,
    capture: { source: 'BARCODE', raw: 'AMZN-GC-99887766', code: 'AMZNGC99887766', last4: '7766' },
  })),
  captureCreditPhoto: vi.fn(async () => ({
    merchant: 'Amazon',
    code: 'AMZNGC99887766',
    last4: '7766',
    suggestedBalanceMinor: 250000,
    confidence: 0.88,
    capture: { source: 'PHOTO', imageKey: 'gift-cards/x.jpg', last4: '7766' },
  })),
  addCredit: vi.fn(async (_token: string, body: { merchant?: string; idempotencyKey?: string }) => ({
    id: '55555555-5555-4555-8555-555555555555',
    userId: '22222222-2222-4222-8222-222222222222',
    kind: 'GIFT_CARD',
    merchant: body.merchant ?? 'Amazon',
    currency: 'INR',
    balanceCacheMinor: 1000,
    expiresAt: null,
    status: 'ACTIVE',
  })),
  spendCredit: vi.fn(async () => ({ balanceMinor: 4000 })),
  undoSpendCredit: vi.fn(async () => ({ balanceMinor: 5000, undone: true })),
  mergeCredits: vi.fn(async () => ({
    account: {
      id: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      kind: 'GIFT_CARD',
      merchant: 'Myntra',
      currency: 'INR',
      balanceCacheMinor: 4200,
      expiresAt: null,
      status: 'ACTIVE',
    },
    mergedFromId: '33333333-3333-4333-8333-333333333333',
    transferredMinor: 1200,
  })),
  markCreditExpiryHandled: vi.fn(async () => ({
    accountId: '11111111-1111-4111-8111-111111111111',
    snoozedUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    status: 'skipped',
  })),
  markReturnRefunded: vi.fn(async () => ({
    id: '88888888-8888-4888-8888-888888888888',
    state: 'REFUNDED',
    refundMinor: 2500,
  })),
  bookReturnPickup: vi.fn(async () => ({
    id: '88888888-8888-4888-8888-888888888888',
    state: 'PICKUP_SCHEDULED',
    pickupSlotAt: '2026-09-01T10:00:00.000Z',
  })),
  fetchSizeMap: vi.fn(async () => ({ brands: [] })),
  createDisposition: vi.fn(async () => ({
    id: '66666666-6666-4666-8666-666666666666',
    wardrobeItemId: '77777777-7777-4777-8777-777777777777',
    mode: 'SELL',
    status: 'ACTIVE',
  })),
  fetchIngestionSources: vi.fn(async () => ({
    sources: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        kind: 'EMAIL',
        provider: 'gmail',
        consentGrantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        status: 'IDLE',
        cursor: null,
        lastSyncAt: null,
        meta: { mutedMerchants: ['ZOMATO'] },
      },
    ],
  })),
  fetchIngestionMetrics: vi.fn(async () => ({
    coverage: 0.42,
    totalMessages: 12,
    byKind: { EMAIL: 10, SMS: 2 },
    byMerchant: { AMAZON: 5 },
  })),
  fetchIngestionActivity: vi.fn(async () => ({ items: [] })),
  fetchPurchases: vi.fn(async () => ({ purchases: [{ id: 'p1', merchant: 'AMAZON' }] })),
  mergePurchases: vi.fn(async () => ({ purchase: { id: 'p1' } })),
  splitPurchase: vi.fn(async () => ({ purchase: { id: 'p2' } })),
  fetchWardrobe: vi.fn(async () => ({ items: [] })),
  fetchWasteSummary: vi.fn(async () => ({ deadCount: 0, totalCostMinor: 0 })),
  fetchWasteDead: vi.fn(async () => ({ items: [] })),
  fetchRewearStreak: vi.fn(async () => ({
    currentStreak: 2,
    longestStreak: 5,
    todayLogged: false,
    lastWearOn: null,
    brokenByPurchase: false,
    label: '',
  })),
  disposeWasteItem: vi.fn(async () => ({ ok: true })),
  fetchReturns: vi.fn(async () => ({ requests: [] })),
  fetchReturnDetail: vi.fn(async () => ({ id: 'ret1', state: 'INITIATED' })),
  fetchRefundEtaBoard: vi.fn(async () => ({ items: [] })),
  initiateReturn: vi.fn(async () => ({ id: 'ret1', state: 'INITIATED' })),
  confirmReturn: vi.fn(async () => ({ id: 'ret1', state: 'IN_TRANSIT' })),
  fetchPackages: vi.fn(async () => ({ packages: [{ id: 'pkg1' }] })),
  markPackageDelivered: vi.fn(async () => ({ id: 'pkg1', status: 'DELIVERED' })),
  fetchExchanges: vi.fn(async () => ({ exchanges: [] })),
  fetchHouseholds: vi.fn(async () => ({ households: [] })),
  fetchBudgets: vi.fn(async () => ({ budgets: [] })),
  createBudget: vi.fn(async () => ({ id: 'b1', category: 'APPAREL' })),
  fetchAccountantLedger: vi.fn(async () => ({ entries: [] })),
  logWear: vi.fn(async () => ({ id: 'w1' })),
  uploadWearPhoto: vi.fn(async () => ({ imageKey: 'wear/x.jpg' })),
  exportVaultData: vi.fn(async () => ({ userId: 'u1', consents: [] })),
  deleteVault: vi.fn(async () => undefined),
  trackPlayBuyInCloset: vi.fn(async () => ({
    purchase: { id: 'p1' },
    created: true,
    items: [{ id: 'i1' }],
  })),
  checkPrebuyFit: vi.fn(async () => ({
    score: 0.8,
    softBlock: false,
    overlaps: [],
  })),
  fetchRecipients: vi.fn(async () => ({
    recipients: [{ id: 'r1', name: 'Mom', relationship: 'FAMILY', region: 'IN' }],
  })),
  createRecipient: vi.fn(async (_t: string, body: { name: string }) => ({
    id: 'r2',
    name: body.name,
    relationship: 'OTHER',
    region: 'IN',
  })),
  createGiftOrder: vi.fn(async () => ({ id: 'g1', status: 'ORDERED' })),
  fetchTodayOutfit: vi.fn(async () => ({
    outfit: { id: 'o1', itemIds: [], reason: 'clear skies' },
  })),
  fetchWarranties: vi.fn(async () => ({ warranties: [] })),
  fetchAccountantSummary: vi.fn(async () => ({ spendMinor: 100, foundMoneyMinor: 0 })),
  fetchAccountantSeasonRoi: vi.fn(async () => ({ seasons: [] })),
  fetchAccountantExportCsv: vi.fn(async () => 'kind,amount\nSPEND,100\n'),
  fetchSwapCircles: vi.fn(async () => ({ circles: [] })),
  createSwapCircle: vi.fn(async () => ({ id: 'sc1', name: 'Friends' })),
  joinSwapCircle: vi.fn(async () => ({ id: 'sc1' })),
  fetchSwapListings: vi.fn(async () => ({ listings: [] })),
  borrowSwapListing: vi.fn(async () => ({ id: 'sl1', status: 'BORROWED' })),
  lendWardrobeItem: vi.fn(async () => ({ id: 'w1', lentTo: 'Ada' })),
  returnLentWardrobeItem: vi.fn(async () => ({ id: 'w1' })),
  createHousehold: vi.fn(async () => ({ id: 'hh1', name: 'Home' })),
  joinHousehold: vi.fn(async () => ({ id: 'hh1' })),
  fetchHouseholdWardrobe: vi.fn(async () => ({ items: [] })),
  fetchClosetProfiles: vi.fn(async () => ({ profiles: [] })),
  createClosetProfile: vi.fn(async () => ({ id: 'cp1', name: 'Me', kind: 'SELF' })),
  deleteClosetProfile: vi.fn(async () => undefined),
  fetchLentWardrobe: vi.fn(async () => ({ items: [{ id: 'w1', dueOn: '2026-08-01' }] })),
  fetchRtoRecovery: vi.fn(async () => ({
    board: [{ purchaseId: 'pkg-rto', deliveryStatus: 'FAILED' }],
  })),
  startRtoRefund: vi.fn(async () => ({ id: 'ret-rto', state: 'INITIATED' })),
  createReturn: vi.fn(async () => ({ id: 'ret-new', state: 'INITIATED' })),
  patchInterviewKit: vi.fn(async () => ({
    kit: { id: 'kit1', kind: 'interview', reminderScheduled: false },
  })),
  runPhotoDumpFromUris: vi.fn(async () => ({ created: 3, tagged: 2 })),
  checkCreditBalance: vi.fn(async () => ({ balanceMinor: 4000, source: true })),
  confirmCreditBalance: vi.fn(async () => ({ balanceMinor: 3500 })),
  fetchReceipts: vi.fn(async () => ({ receipts: [{ id: 'rc1' }] })),
  exportReceipt: vi.fn(async () => ({ format: 'pdf', url: 'https://x/r.pdf' })),
  uploadReceipt: vi.fn(async () => ({ id: 'rc2', merchant: 'Amazon' })),
  confirmReceipt: vi.fn(async () => ({ id: 'rc2', status: 'CONFIRMED' })),
  claimWarranty: vi.fn(async () => ({ id: 'war1', status: 'CLAIMED' })),
  unclaimWarranty: vi.fn(async () => ({ id: 'war1', status: 'ACTIVE' })),
  snoozeWarranty: vi.fn(async () => ({ id: 'war1', snoozedUntil: '2026-09-01' })),
  fetchCashbackClaims: vi.fn(async () => ({ claims: [] })),
  createCashbackClaim: vi.fn(async () => ({ id: 'cb1' })),
  markCashbackClaimed: vi.fn(async () => ({ id: 'cb1', status: 'CLAIMED' })),
  uploadWardrobeItem: vi.fn(async () => ({ id: 'w2', category: 'TOP' })),
  uploadWardrobeItemsBulk: vi.fn(async () => ({ created: 2 })),
  wardrobeFromPurchases: vi.fn(async () => ({ created: 1 })),
  fetchImportablePurchases: vi.fn(async () => ({ items: [] })),
  tryOnWardrobeItem: vi.fn(async () => ({ previewUrl: 'https://x/t.jpg' })),
  updateWardrobeItem: vi.fn(async () => ({
    id: 'w1',
    laundryStatus: 'CLEAN',
    closetStatus: 'ACTIVE',
  })),
  BULK_UPDATE_MAX_IDS: 200,
  bulkUpdateWardrobeItems: vi.fn(async (_token: string, ids: string[]) => ({
    items: ids.map((id) => ({ id, closetStatus: 'STORED' })),
  })),
  careOcrWardrobeItem: vi.fn(async () => ({ itemId: 'w1', care: 'dry-clean' })),
  careOcrWardrobePhoto: vi.fn(async () => ({ itemId: 'w1', care: 'hand-wash' })),
  dryCleanDropOff: vi.fn(async () => ({ item: { id: 'w1' }, phase: 'DROPPED' })),
  dryCleanConfirm: vi.fn(async () => ({ item: { id: 'w1' }, phase: 'READY' })),
  seasonalSwapWardrobe: vi.fn(async () => ({ season: 'summer', active: 3, stored: 2 })),
  buildTravelPack: vi.fn(async () => ({
    nights: 3,
    items: [],
    checklist: '# pack',
    startDate: '2026-09-01',
  })),
  planWorkwearWeek: vi.fn(async () => ({ days: [{ date: '2026-09-01' }], unique: 4 })),
  outfitsFromCalendar: vi.fn(async () => ({
    events: [{ occasion: 'wedding', startAt: '2026-09-10' }],
  })),
  planWeddingFestival: vi.fn(async () => ({ kind: 'wedding', dayCount: 3 })),
  saveInterviewKit: vi.fn(async () => ({
    kit: { kind: 'interview', reminderScheduled: true },
  })),
  deleteWardrobeItem: vi.fn(async () => undefined),
  selectTodayOutfit: vi.fn(async () => ({ outfitId: 'o1' })),
  fetchWeekOutfits: vi.fn(async () => ({ days: [] })),
  generateWeekOutfit: vi.fn(async () => ({ ok: true })),
  patchWeekDayOutfit: vi.fn(async () => ({ id: 'o1', itemIds: ['w1'] })),
  fetchGoesWith: vi.fn(async () => ({ items: [] })),
  fetchShoeBagRotation: vi.fn(async () => ({ suggestions: [] })),
  fetchMissingPieces: vi.fn(async () => ({ gaps: [] })),
  fetchCapsule: vi.fn(async () => ({ itemIds: ['w1'] })),
  saveCapsule: vi.fn(async () => ({ itemIds: ['w1', 'w2'] })),
  fetchReplaceTwins: vi.fn(async () => ({ twins: [] })),
  recordReplaceTwinClick: vi.fn(async () => ({ ok: true })),
  fetchCompleteLook: vi.fn(async () => ({ owned: [], gaps: [] })),
  startWearChallenge: vi.fn(async () => ({ wardrobeItemId: 'w1' })),
  startDeclutterChallenge: vi.fn(async () => ({
    declutterChallenge: { progress: 0, target: 5 },
  })),
  setCpwGoal: vi.fn(async () => ({ wardrobeItemId: 'w1', targetCpwMinor: 100 })),
  fetchRecipientIdeas: vi.fn(async () => ({ ideas: [] })),
  fetchMeasurements: vi.fn(async () => ({ profiles: [] })),
  createMeasurement: vi.fn(async () => ({ id: 'm1' })),
  fetchTemplates: vi.fn(async () => ({ templates: [] })),
  createTailoringOrder: vi.fn(async () => ({ id: 'to1' })),
  reorderTailoringOrder: vi.fn(async () => ({ id: 'to2' })),
  fetchTailoringOrder: vi.fn(async () => ({ id: 'to1', status: 'PLACED' })),
  fetchTailoringOrders: vi.fn(async () => ({ orders: [] })),
  fetchFitTailors: vi.fn(async () => ({ tailors: [] })),
  previewFitCustomization: vi.fn(async () => ({ previewUrl: 'https://x/f.jpg' })),
  fetchDisposition: vi.fn(async () => ({ listings: [] })),
  correctIngestionDocument: vi.fn(async () => ({ id: 'doc1' })),
  scanPriceDrops: vi.fn(async () => ({
    hits: [{ listingId: 'l1', currentPriceMinor: 500 }],
    scannedListings: 1,
  })),
  fetchEmiPlans: vi.fn(async () => ({ plans: [{ id: 'emi1', status: 'ACTIVE' }] })),
  payEmiPlan: vi.fn(async () => ({ id: 'emi1', status: 'PAID' })),
  createBrandPriceWatch: vi.fn(async () => ({ id: 'pw1', brand: 'Nike' })),
  createEmiFromSms: vi.fn(async () => ({ id: 'emi2', provider: 'HDFC' })),
  fetchHouseholdVault: vi.fn(async () => ({
    accounts: [{ id: 'gc1', merchant: 'Amazon', balanceCacheMinor: 1000 }],
  })),
  patchHouseholdVaultMember: vi.fn(async () => ({ ok: true })),
  spendHouseholdVault: vi.fn(async () => ({ balanceMinor: 500 })),
  patchIngestionSource: vi.fn(async (_token: string, id: string, body: { mutedMerchants?: string[] }) => ({
    source: {
      id,
      kind: 'EMAIL',
      provider: 'gmail',
      consentGrantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      status: 'IDLE',
      cursor: null,
      lastSyncAt: null,
      meta: { mutedMerchants: body.mutedMerchants ?? [] },
    },
  })),
}));

vi.mock('@/src/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));
function Probe() {
  const { data, isLoading } = useGiftCards();
  if (isLoading) return <span>loading</span>;
  const count = data?.accounts.length ?? 0;
  return <span>{count} cards</span>;
}

function AddProbe({ onReady }: { onReady: (mutate: ReturnType<typeof useAddGiftCard>['mutateAsync']) => void }) {
  const add = useAddGiftCard();
  onReady(add.mutateAsync);
  return <span>ready</span>;
}

beforeEach(() => {
  sessionState.accessToken = 'test-token';
});

describe('useGiftCards', () => {
  beforeEach(() => {
    vi.mocked(fetchCredits).mockClear();
    vi.mocked(addCredit).mockClear();
  });

  it('loads gift cards from the API', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('2 cards')).toBeTruthy();
    });
    expect(fetchCredits).toHaveBeenCalledWith('test-token');
  });

  it('passes kind filter to fetchCredits', async () => {
    function KindProbe() {
      const { data, isLoading } = useGiftCards('LOYALTY_POINTS');
      if (isLoading) return <span>loading</span>;
      return <span>{data?.accounts.length ?? 0} cards</span>;
    }

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <KindProbe />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('2 cards')).toBeTruthy();
    });
    expect(fetchCredits).toHaveBeenCalledWith('test-token', { kind: 'LOYALTY_POINTS' });
  });
});

describe('useAddGiftCard', () => {
  beforeEach(() => {
    vi.mocked(addCredit).mockClear();
  });

  it('generates an idempotencyKey when the caller omits one', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let mutateAsync!: ReturnType<typeof useAddGiftCard>['mutateAsync'];
    render(
      <QueryClientProvider client={client}>
        <AddProbe
          onReady={(m) => {
            mutateAsync = m;
          }}
        />
      </QueryClientProvider>,
    );

    await act(async () => {
      await mutateAsync({
        kind: 'GIFT_CARD',
        merchant: 'Amazon',
        currency: 'INR',
        balanceMinor: 1000,
      });
    });

    expect(addCredit).toHaveBeenCalledTimes(1);
    const body = vi.mocked(addCredit).mock.calls[0]![1];
    expect(body.idempotencyKey).toBeTruthy();
    expect(typeof body.idempotencyKey).toBe('string');
  });

  it('preserves an explicit idempotencyKey from the caller', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let mutateAsync!: ReturnType<typeof useAddGiftCard>['mutateAsync'];
    render(
      <QueryClientProvider client={client}>
        <AddProbe
          onReady={(m) => {
            mutateAsync = m;
          }}
        />
      </QueryClientProvider>,
    );

    const key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await act(async () => {
      await mutateAsync({
        kind: 'GIFT_CARD',
        merchant: 'Amazon',
        currency: 'INR',
        balanceMinor: 1000,
        idempotencyKey: key,
      });
    });

    expect(vi.mocked(addCredit).mock.calls[0]![1].idempotencyKey).toBe(key);
  });

  it('forwards barcode / photo capture metadata when adding a gift card', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let mutateAsync!: ReturnType<typeof useAddGiftCard>['mutateAsync'];
    render(
      <QueryClientProvider client={client}>
        <AddProbe
          onReady={(m) => {
            mutateAsync = m;
          }}
        />
      </QueryClientProvider>,
    );

    await act(async () => {
      await mutateAsync({
        kind: 'GIFT_CARD',
        merchant: 'Amazon',
        currency: 'INR',
        balanceMinor: 2500,
        capture: {
          source: 'BARCODE',
          raw: 'Amazon|GC-99887766',
          code: 'GC-99887766',
          last4: '7766',
        },
      });
    });

    const body = vi.mocked(addCredit).mock.calls[0]![1];
    expect(body.capture).toEqual({
      source: 'BARCODE',
      raw: 'Amazon|GC-99887766',
      code: 'GC-99887766',
      last4: '7766',
    });
  });
});

describe('useMarkReturnRefunded', () => {
  beforeEach(() => {
    vi.mocked(markReturnRefunded).mockClear();
  });

  it('posts refund and invalidates returns + accountant ledger', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    let mutateAsync!: ReturnType<typeof useMarkReturnRefunded>['mutateAsync'];

    function RefundProbe({
      onReady,
    }: {
      onReady: (m: ReturnType<typeof useMarkReturnRefunded>['mutateAsync']) => void;
    }) {
      const mark = useMarkReturnRefunded();
      onReady(mark.mutateAsync);
      return <span>refund</span>;
    }

    render(
      <QueryClientProvider client={client}>
        <RefundProbe
          onReady={(m) => {
            mutateAsync = m;
          }}
        />
      </QueryClientProvider>,
    );

    await act(async () => {
      await mutateAsync({
        id: '88888888-8888-4888-8888-888888888888',
        refundMinor: 2500,
        destination: 'ORIGINAL_CARD',
      });
    });

    expect(markReturnRefunded).toHaveBeenCalledWith(
      'test-token',
      '88888888-8888-4888-8888-888888888888',
      { refundMinor: 2500, destination: 'ORIGINAL_CARD' },
    );
    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey?: unknown[] })?.queryKey?.[0]);
    expect(keys).toContain('returns');
    expect(keys).toContain('accountant-ledger');
    expect(keys).toContain('gift-cards');
  });
});

describe('useCreateDisposition', () => {
  it('invalidates waste-dead on success', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    let mutateAsync!: ReturnType<typeof useCreateDisposition>['mutateAsync'];

    function DispProbe({
      onReady,
    }: {
      onReady: (m: ReturnType<typeof useCreateDisposition>['mutateAsync']) => void;
    }) {
      const create = useCreateDisposition();
      onReady(create.mutateAsync);
      return <span>disp</span>;
    }

    render(
      <QueryClientProvider client={client}>
        <DispProbe
          onReady={(m) => {
            mutateAsync = m;
          }}
        />
      </QueryClientProvider>,
    );

    await act(async () => {
      await mutateAsync({
        wardrobeItemId: '77777777-7777-4777-8777-777777777777',
        mode: 'SELL',
      });
    });

    expect(createDisposition).toHaveBeenCalled();
    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey?: unknown[] })?.queryKey?.[0]);
    expect(keys).toContain('waste-dead');
    expect(keys).toContain('disposition');
  });
});

describe('useMuteMerchant', () => {
  beforeEach(() => {
    vi.mocked(fetchIngestionSources).mockClear();
    vi.mocked(patchIngestionSource).mockClear();
  });

  it('appends merchant to source mutedMerchants via PATCH', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let mutateAsync!: ReturnType<typeof useMuteMerchant>['mutateAsync'];

    function MuteProbe({
      onReady,
    }: {
      onReady: (m: ReturnType<typeof useMuteMerchant>['mutateAsync']) => void;
    }) {
      const mute = useMuteMerchant();
      onReady(mute.mutateAsync);
      return <span>mute</span>;
    }

    render(
      <QueryClientProvider client={client}>
        <MuteProbe
          onReady={(m) => {
            mutateAsync = m;
          }}
        />
      </QueryClientProvider>,
    );

    await act(async () => {
      await mutateAsync('SWIGGY');
    });

    expect(fetchIngestionSources).toHaveBeenCalledWith('test-token', expect.any(AbortSignal));
    expect(patchIngestionSource).toHaveBeenCalledWith(
      'test-token',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      { mutedMerchants: ['ZOMATO', 'SWIGGY'] },
    );
  });
});

describe('useCaptureGiftCard', () => {
  beforeEach(() => {
    vi.mocked(captureCreditBarcode).mockClear();
    vi.mocked(captureCreditPhoto).mockClear();
  });

  it('calls barcode capture API', async () => {
    function Probe({ onReady }: { onReady: (m: ReturnType<typeof useCaptureGiftCard>['mutateAsync']) => void }) {
      const cap = useCaptureGiftCard();
      onReady(cap.mutateAsync);
      return <span>ready</span>;
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let mutateAsync!: ReturnType<typeof useCaptureGiftCard>['mutateAsync'];
    render(
      <QueryClientProvider client={client}>
        <Probe onReady={(m) => { mutateAsync = m; }} />
      </QueryClientProvider>,
    );
    let result!: Awaited<ReturnType<typeof mutateAsync>>;
    await act(async () => {
      result = await mutateAsync({ mode: 'barcode', barcode: 'AMZN-GC-99887766' });
    });
    expect(captureCreditBarcode).toHaveBeenCalledWith('test-token', 'AMZN-GC-99887766');
    expect(result.last4).toBe('7766');
    expect(result.capture.source).toBe('BARCODE');
  });

  it('calls photo capture API with optional barcode', async () => {
    function Probe({ onReady }: { onReady: (m: ReturnType<typeof useCaptureGiftCard>['mutateAsync']) => void }) {
      const cap = useCaptureGiftCard();
      onReady(cap.mutateAsync);
      return <span>ready</span>;
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let mutateAsync!: ReturnType<typeof useCaptureGiftCard>['mutateAsync'];
    render(
      <QueryClientProvider client={client}>
        <Probe onReady={(m) => { mutateAsync = m; }} />
      </QueryClientProvider>,
    );
    await act(async () => {
      await mutateAsync({ mode: 'photo', imageUri: 'file:///card.jpg', barcode: 'AMZN-GC' });
    });
    expect(captureCreditPhoto).toHaveBeenCalledWith('test-token', 'file:///card.jpg', {
      barcode: 'AMZN-GC',
    });
  });
});

describe('useCloset', () => {
  beforeEach(() => {
    vi.mocked(fetchIngestionSources).mockClear();
    vi.mocked(fetchIngestionMetrics).mockClear();
  });

  it('loads sources + metrics and reports connected coverage', async () => {
    function ClosetProbe() {
      const { data, isLoading } = useCloset();
      if (isLoading || !data) return <span>loading</span>;
      return (
        <span>
          {data.connected ? 'connected' : 'empty'} {Math.round(data.coverage * 100)}% {data.sources.length}
        </span>
      );
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <ClosetProbe />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('connected 42% 1')).toBeTruthy();
    });
    expect(fetchIngestionSources).toHaveBeenCalledWith('test-token', expect.any(AbortSignal));
    expect(fetchIngestionMetrics).toHaveBeenCalledWith('test-token', expect.any(AbortSignal));
  });
});

describe('useSpendGiftCard', () => {
  beforeEach(() => {
    vi.mocked(spendCredit).mockClear();
  });

  it('spends with a generated idempotencyKey and invalidates gift-cards', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    let mutateAsync!: ReturnType<typeof useSpendGiftCard>['mutateAsync'];

    function SpendProbe({
      onReady,
    }: {
      onReady: (m: ReturnType<typeof useSpendGiftCard>['mutateAsync']) => void;
    }) {
      const spend = useSpendGiftCard();
      onReady(spend.mutateAsync);
      return <span>spend</span>;
    }

    render(
      <QueryClientProvider client={client}>
        <SpendProbe
          onReady={(m) => {
            mutateAsync = m;
          }}
        />
      </QueryClientProvider>,
    );

    await act(async () => {
      await mutateAsync({
        id: '11111111-1111-4111-8111-111111111111',
        amountMinor: 1000,
      });
    });

    expect(spendCredit).toHaveBeenCalledTimes(1);
    const [, id, body] = vi.mocked(spendCredit).mock.calls[0]!;
    expect(id).toBe('11111111-1111-4111-8111-111111111111');
    expect(body.amountMinor).toBe(1000);
    expect(body.idempotencyKey).toBeTruthy();
    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey?: unknown[] })?.queryKey?.[0]);
    expect(keys).toContain('gift-cards');
  });
});

describe('useMuteMerchant without sources', () => {
  it('throws when no ingestion source is connected', async () => {
    vi.mocked(fetchIngestionSources).mockResolvedValueOnce({ sources: [] } as never);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let mutateAsync!: ReturnType<typeof useMuteMerchant>['mutateAsync'];

    function MuteProbe({
      onReady,
    }: {
      onReady: (m: ReturnType<typeof useMuteMerchant>['mutateAsync']) => void;
    }) {
      const mute = useMuteMerchant();
      onReady(mute.mutateAsync);
      return <span>mute</span>;
    }

    render(
      <QueryClientProvider client={client}>
        <MuteProbe
          onReady={(m) => {
            mutateAsync = m;
          }}
        />
      </QueryClientProvider>,
    );

    await expect(mutateAsync('SWIGGY')).rejects.toThrow(/Connect email/i);
  });

  it('defaults mutedMerchants to [] when source meta omits the list', async () => {
    vi.mocked(fetchIngestionSources).mockResolvedValueOnce({
      sources: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          kind: 'EMAIL',
          provider: 'gmail',
          consentGrantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          status: 'IDLE',
          cursor: null,
          lastSyncAt: null,
          meta: null,
        },
      ],
    } as never);
    vi.mocked(patchIngestionSource).mockClear();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let mutateAsync!: ReturnType<typeof useMuteMerchant>['mutateAsync'];
    function MuteProbe({
      onReady,
    }: {
      onReady: (m: ReturnType<typeof useMuteMerchant>['mutateAsync']) => void;
    }) {
      onReady(useMuteMerchant().mutateAsync);
      return <span>mute</span>;
    }
    render(
      <QueryClientProvider client={client}>
        <MuteProbe onReady={(m) => { mutateAsync = m; }} />
      </QueryClientProvider>,
    );
    await act(async () => {
      await mutateAsync('SWIGGY');
    });
    expect(patchIngestionSource).toHaveBeenCalledWith(
      'test-token',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      { mutedMerchants: ['SWIGGY'] },
    );
  });
});

describe('closet query hooks', () => {
  beforeEach(() => {
    sessionState.accessToken = 'test-token';
  });

  it('loads ingestion status / sources / metrics', async () => {
    function Bundle() {
      const status = useIngestionStatus();
      const sources = useIngestionSources();
      const metrics = useIngestionMetrics();
      if ([status, sources, metrics].some((q) => q.isLoading)) return <span>loading</span>;
      return (
        <span>
          ok {status.data?.connected ? 'yes' : 'no'} cov={metrics.data?.coverage} src=
          {sources.data?.sources?.length ?? 0}
        </span>
      );
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Bundle />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText(/ok yes/)).toBeTruthy();
    });
    expect(fetchIngestionSources).toHaveBeenCalled();
    expect(fetchIngestionMetrics).toHaveBeenCalled();
  });

  it('loads wardrobe / waste / returns / packages', async () => {
    function Bundle() {
      const wardrobe = useWardrobe();
      const waste = useWasteSummary();
      const returns = useReturns();
      const packages = usePackages(true);
      if ([wardrobe, waste, returns, packages].some((q) => q.isLoading)) return <span>loading</span>;
      return (
        <span>
          ward={wardrobe.data ? 'yes' : 'no'} pkg={packages.data ? 'yes' : 'no'} ret=
          {returns.data ? 'yes' : 'no'}
        </span>
      );
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Bundle />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText(/ward=yes/)).toBeTruthy();
    });
    expect(screen.getByText(/pkg=yes/)).toBeTruthy();
    expect(fetchWardrobe).toHaveBeenCalledWith(
      'test-token',
      undefined,
      { limit: 50, cursor: null },
      expect.any(AbortSignal),
    );
    expect(fetchWasteSummary).toHaveBeenCalled();
    expect(fetchReturns).toHaveBeenCalled();
    expect(fetchPackages).toHaveBeenCalledWith('test-token', true, expect.any(AbortSignal));
  });
});

describe('vault / play-bridge mutations', () => {
  beforeEach(() => {
    sessionState.accessToken = 'test-token';
    sessionState.clear.mockClear();
    vi.mocked(exportVaultData).mockClear();
    vi.mocked(deleteVault).mockClear();
    vi.mocked(trackPlayBuyInCloset).mockClear();
    vi.mocked(checkPrebuyFit).mockClear();
    vi.mocked(shareTextFile).mockClear();
  });

  it('exports vault JSON via shareTextFile', async () => {
    let mutateAsync!: ReturnType<typeof useExportVault>['mutateAsync'];
    function Probe({ onReady }: { onReady: (m: typeof mutateAsync) => void }) {
      const exp = useExportVault();
      onReady(exp.mutateAsync);
      return <span>export</span>;
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <Probe onReady={(m) => { mutateAsync = m; }} />
      </QueryClientProvider>,
    );
    await act(async () => {
      await mutateAsync();
    });
    expect(exportVaultData).toHaveBeenCalledWith('test-token');
    expect(shareTextFile).toHaveBeenCalled();
  });

  it('deletes vault and clears session', async () => {
    let mutateAsync!: ReturnType<typeof useDeleteVault>['mutateAsync'];
    function Probe({ onReady }: { onReady: (m: typeof mutateAsync) => void }) {
      const del = useDeleteVault();
      onReady(del.mutateAsync);
      return <span>delete</span>;
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <Probe onReady={(m) => { mutateAsync = m; }} />
      </QueryClientProvider>,
    );
    await act(async () => {
      await mutateAsync();
    });
    expect(deleteVault).toHaveBeenCalledWith('test-token');
    expect(sessionState.clear).toHaveBeenCalled();
  });

  it('tracks Play buy and checks prebuy fit', async () => {
    let track!: ReturnType<typeof useTrackPlayBuy>['mutateAsync'];
    let fit!: ReturnType<typeof usePrebuyFit>['mutateAsync'];
    function Probe({
      onReady,
    }: {
      onReady: (t: typeof track, f: typeof fit) => void;
    }) {
      const t = useTrackPlayBuy();
      const f = usePrebuyFit();
      onReady(t.mutateAsync, f.mutateAsync);
      return <span>bridge</span>;
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <Probe
          onReady={(t, f) => {
            track = t;
            fit = f;
          }}
        />
      </QueryClientProvider>,
    );
    await act(async () => {
      await track({ orderId: 'o1' });
      await fit({ useCart: true });
    });
    expect(trackPlayBuyInCloset).toHaveBeenCalledWith('test-token', 'o1', true);
    expect(checkPrebuyFit).toHaveBeenCalledWith('test-token', { useCart: true });
  });

  it('rejects capture / export / track / prebuy when signed out', async () => {
    sessionState.accessToken = null;
    let capture!: ReturnType<typeof useCaptureGiftCard>['mutateAsync'];
    let exp!: ReturnType<typeof useExportVault>['mutateAsync'];
    let track!: ReturnType<typeof useTrackPlayBuy>['mutateAsync'];
    let fit!: ReturnType<typeof usePrebuyFit>['mutateAsync'];
    function Probe() {
      capture = useCaptureGiftCard().mutateAsync;
      exp = useExportVault().mutateAsync;
      track = useTrackPlayBuy().mutateAsync;
      fit = usePrebuyFit().mutateAsync;
      return <span>signed-out</span>;
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
    await expect(capture({ mode: 'barcode', barcode: 'x' })).rejects.toThrow(/Sign in/i);
    await expect(exp()).rejects.toThrow(/Sign in/i);
    await expect(track({ orderId: 'o1' })).rejects.toThrow(/Sign in/i);
    await expect(fit({ listingIds: ['l1'] })).rejects.toThrow(/Sign in/i);
  });
});

describe('gift / outfit / accountant query surface', () => {
  beforeEach(() => {
    sessionState.accessToken = 'test-token';
    vi.mocked(fetchRecipients).mockClear();
    vi.mocked(fetchTodayOutfit).mockClear();
    vi.mocked(fetchWarranties).mockClear();
    vi.mocked(fetchAccountantSummary).mockClear();
    vi.mocked(createRecipient).mockClear();
    vi.mocked(createGiftOrder).mockClear();
  });

  it('loads recipients, today outfit, warranties, accountant; creates gift recipient/order', async () => {
    let createRec!: ReturnType<typeof useCreateRecipient>['mutateAsync'];
    let createGift!: ReturnType<typeof useCreateGiftOrder>['mutateAsync'];

    function Bundle() {
      const recipients = useRecipients();
      const today = useTodayOutfit();
      const warranties = useWarranties();
      const accountant = useAccountantSummary();
      createRec = useCreateRecipient().mutateAsync;
      createGift = useCreateGiftOrder().mutateAsync;
      if (
        recipients.isLoading ||
        today.isLoading ||
        warranties.isLoading ||
        accountant.isLoading
      ) {
        return <span>loading</span>;
      }
      return (
        <span>
          rec={recipients.data?.recipients?.length ?? 0} today=
          {today.data ? 'yes' : 'no'} acct={accountant.data ? 'yes' : 'no'}
        </span>
      );
    }

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <Bundle />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText(/rec=1/)).toBeTruthy();
    });
    expect(screen.getByText(/today=yes/)).toBeTruthy();
    expect(screen.getByText(/acct=yes/)).toBeTruthy();
    expect(fetchRecipients).toHaveBeenCalledWith('test-token', expect.any(AbortSignal));
    expect(fetchTodayOutfit).toHaveBeenCalledWith('test-token', undefined, expect.any(AbortSignal));
    expect(fetchWarranties).toHaveBeenCalledWith('test-token');
    expect(fetchAccountantSummary).toHaveBeenCalledWith('test-token', expect.any(AbortSignal));

    await act(async () => {
      await createRec({ name: 'Dad' });
      await createGift({ recipientId: 'r1', occasion: 'BIRTHDAY' });
    });
    expect(createRecipient).toHaveBeenCalled();
    expect(createGiftOrder).toHaveBeenCalled();
  });
});

describe('hidden tabs (MOB 30)', () => {
  beforeEach(() => {
    sessionState.accessToken = 'test-token';
    vi.mocked(fetchAccountantSummary).mockClear();
  });

  it("doesn't refetch a hidden tab's queries until it shows again", async () => {
    function Summary() {
      const summary = useAccountantSummary();
      return <span>{summary.data ? 'loaded' : 'loading'}</span>;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (focused: boolean) => (
      <QueryClientProvider client={client}>
        <ClosetScreenFocus.Provider value={focused}>
          <Summary />
        </ClosetScreenFocus.Provider>
      </QueryClientProvider>
    );
    const { rerender } = render(tree(true));
    await waitFor(() => {
      expect(screen.getByText('loaded')).toBeTruthy();
    });
    expect(fetchAccountantSummary).toHaveBeenCalledTimes(1);

    rerender(tree(false));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['accountant-summary'] });
    });
    expect(fetchAccountantSummary).toHaveBeenCalledTimes(1);
    expect(screen.getByText('loaded')).toBeTruthy();

    rerender(tree(true));
    await waitFor(() => {
      expect(fetchAccountantSummary).toHaveBeenCalledTimes(2);
    });
  });
});

describe('purchases / returns / waste / packages / household surface', () => {
  beforeEach(() => {
    sessionState.accessToken = 'test-token';
    vi.mocked(fetchPurchases).mockClear();
    vi.mocked(mergePurchases).mockClear();
    vi.mocked(splitPurchase).mockClear();
    vi.mocked(initiateReturn).mockClear();
    vi.mocked(confirmReturn).mockClear();
    vi.mocked(fetchWasteDead).mockClear();
    vi.mocked(fetchRewearStreak).mockClear();
    vi.mocked(disposeWasteItem).mockClear();
    vi.mocked(markPackageDelivered).mockClear();
    vi.mocked(fetchBudgets).mockClear();
    vi.mocked(createBudget).mockClear();
    vi.mocked(fetchAccountantLedger).mockClear();
    vi.mocked(logWear).mockClear();
    vi.mocked(uploadWearPhoto).mockClear();
    vi.mocked(fetchExchanges).mockClear();
  });

  it('loads purchases / waste-dead / streak / budgets / ledger / exchanges', async () => {
    function Bundle() {
      const purchases = usePurchases();
      const dead = useWasteDead();
      const streak = useRewearStreak({ breakOnPurchase: true });
      const budgets = useBudgets();
      const ledger = useAccountantLedger();
      const exchanges = useExchanges();
      if (
        [purchases, dead, streak, budgets, ledger, exchanges].some((q) => q.isLoading)
      ) {
        return <span>loading</span>;
      }
      return (
        <span>
          p={purchases.data?.purchases?.length ?? 0} dead=
          {dead.data ? 'yes' : 'no'} streak={streak.data?.currentStreak ?? 0} bud=
          {budgets.data ? 'yes' : 'no'} ex={exchanges.data ? 'yes' : 'no'}
        </span>
      );
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Bundle />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText(/p=1/)).toBeTruthy();
    });
    expect(screen.getByText(/dead=yes/)).toBeTruthy();
    expect(screen.getByText(/streak=2/)).toBeTruthy();
    expect(screen.getByText(/ex=yes/)).toBeTruthy();
    expect(fetchPurchases).toHaveBeenCalledWith('test-token', expect.any(AbortSignal));
    expect(fetchWasteDead).toHaveBeenCalledWith('test-token', expect.any(AbortSignal));
    expect(fetchRewearStreak).toHaveBeenCalledWith('test-token', { breakOnPurchase: true });
    expect(fetchBudgets).toHaveBeenCalledWith('test-token', expect.any(AbortSignal));
    expect(fetchAccountantLedger).toHaveBeenCalledWith('test-token', expect.any(AbortSignal));
    expect(fetchExchanges).toHaveBeenCalledWith('test-token', expect.any(AbortSignal));
  });

  it('merges/splits purchases, initiates/confirms returns, disposes waste, marks package, creates budget, logs wear with photo', async () => {
    let merge!: ReturnType<typeof useMergePurchases>['mutateAsync'];
    let split!: ReturnType<typeof useSplitPurchase>['mutateAsync'];
    let initiate!: ReturnType<typeof useInitiateReturn>['mutateAsync'];
    let confirm!: ReturnType<typeof useConfirmReturn>['mutateAsync'];
    let dispose!: ReturnType<typeof useDisposeWaste>['mutateAsync'];
    let markPkg!: ReturnType<typeof useMarkPackageDelivered>['mutateAsync'];
    let budget!: ReturnType<typeof useCreateBudget>['mutateAsync'];
    let wear!: ReturnType<typeof useLogWear>['mutateAsync'];

    function Bundle() {
      merge = useMergePurchases().mutateAsync;
      split = useSplitPurchase().mutateAsync;
      initiate = useInitiateReturn().mutateAsync;
      confirm = useConfirmReturn().mutateAsync;
      dispose = useDisposeWaste().mutateAsync;
      markPkg = useMarkPackageDelivered().mutateAsync;
      budget = useCreateBudget().mutateAsync;
      wear = useLogWear().mutateAsync;
      return <span>mut</span>;
    }

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    render(
      <QueryClientProvider client={client}>
        <Bundle />
      </QueryClientProvider>,
    );

    await act(async () => {
      await merge({ targetPurchaseId: 'p1', sourcePurchaseId: 'p0' });
      await split({ purchaseId: 'p1', itemIds: ['i1'] });
      await initiate({ id: 'ret1', method: 'PICKUP' });
      await confirm({ id: 'ret1', tracking: 'TRK1' });
      await dispose({ itemId: 'w1', mode: 'DONATE' });
      await markPkg({ id: 'pkg1' });
      await budget({ category: 'APPAREL', period: '2026-08', limitMinor: 10_000 });
      await wear({ wardrobeItemId: 'w1', photoUri: 'file:///wear.jpg', priorWearCount: 0 });
    });

    expect(mergePurchases).toHaveBeenCalled();
    expect(splitPurchase).toHaveBeenCalled();
    expect(initiateReturn).toHaveBeenCalledWith('test-token', 'ret1', { method: 'PICKUP' });
    expect(confirmReturn).toHaveBeenCalledWith('test-token', 'ret1', { tracking: 'TRK1' });
    expect(disposeWasteItem).toHaveBeenCalled();
    expect(markPackageDelivered).toHaveBeenCalledWith('test-token', 'pkg1', {
      addToWardrobe: undefined,
    });
    expect(createBudget).toHaveBeenCalled();
    expect(uploadWearPhoto).toHaveBeenCalledWith('test-token', 'file:///wear.jpg');
    expect(logWear).toHaveBeenCalledWith(
      'test-token',
      expect.objectContaining({ wardrobeItemId: 'w1', imageKey: 'wear/x.jpg' }),
    );
    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey?: unknown[] })?.queryKey?.[0]);
    expect(keys).toContain('purchases');
    expect(keys).toContain('returns');
    expect(keys).toContain('waste-dead');
    expect(keys).toContain('budgets');
  });
});

describe('receipts / warranties / cashback / balance surface', () => {
  beforeEach(() => {
    sessionState.accessToken = 'test-token';
  });

  it('loads receipts/cashback/roi and runs capture-adjacent mutations', async () => {
    let balance!: ReturnType<typeof useBalanceCheck>['mutateAsync'];
    let confirmBal!: ReturnType<typeof useConfirmBalance>['mutateAsync'];
    let upload!: ReturnType<typeof useUploadReceipt>['mutateAsync'];
    let confirmRc!: ReturnType<typeof useConfirmReceipt>['mutateAsync'];
    let exportRc!: ReturnType<typeof useExportReceipt>['mutateAsync'];
    let claim!: ReturnType<typeof useClaimWarranty>['mutateAsync'];
    let unclaim!: ReturnType<typeof useUnclaimWarranty>['mutateAsync'];
    let snooze!: ReturnType<typeof useSnoozeWarranty>['mutateAsync'];
    let createCb!: ReturnType<typeof useCreateCashbackClaim>['mutateAsync'];
    let markCb!: ReturnType<typeof useMarkCashbackClaimed>['mutateAsync'];
    let correct!: ReturnType<typeof useCorrectIngestionDocument>['mutateAsync'];

    function Bundle() {
      const receipts = useReceipts({ merchant: 'Amazon' });
      const cashback = useCashbackClaims('UNCLAIMED');
      const roi = useAccountantSeasonRoi(2026);
      const detail = useReturnDetail('ret1');
      balance = useBalanceCheck().mutateAsync;
      confirmBal = useConfirmBalance().mutateAsync;
      upload = useUploadReceipt().mutateAsync;
      confirmRc = useConfirmReceipt().mutateAsync;
      exportRc = useExportReceipt().mutateAsync;
      claim = useClaimWarranty().mutateAsync;
      unclaim = useUnclaimWarranty().mutateAsync;
      snooze = useSnoozeWarranty().mutateAsync;
      createCb = useCreateCashbackClaim().mutateAsync;
      markCb = useMarkCashbackClaimed().mutateAsync;
      correct = useCorrectIngestionDocument().mutateAsync;
      if ([receipts, cashback, roi, detail].some((q) => q.isLoading)) return <span>loading</span>;
      return (
        <span>
          rc={receipts.data?.receipts?.length ?? 0} cb={cashback.data ? 'yes' : 'no'} roi=
          {roi.data ? 'yes' : 'no'} det={detail.data ? 'yes' : 'no'}
        </span>
      );
    }

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <Bundle />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText(/rc=1/)).toBeTruthy();
    }, { timeout: 5000 });
    expect(fetchReceipts).toHaveBeenCalledWith('test-token', { merchant: 'Amazon' });
    expect(fetchReturnDetail).toHaveBeenCalledWith('test-token', 'ret1', expect.any(AbortSignal));

    await act(async () => {
      await balance('11111111-1111-4111-8111-111111111111');
      await confirmBal({ id: '11111111-1111-4111-8111-111111111111', balanceMinor: 3500 });
      await upload('file:///r.jpg');
      await confirmRc({ id: 'rc2', body: { merchant: 'Amazon' } as never });
      await exportRc({ id: 'rc1', format: 'pdf' });
      await claim('war1');
      await unclaim('war1');
      await snooze({ id: 'war1', days: 7 });
      await createCb({ merchant: 'Amazon', amountMinor: 100 } as never);
      await markCb('cb1');
      await correct({ documentId: 'doc1', body: { merchant: 'AMAZON' } as never });
    });

    expect(checkCreditBalance).toHaveBeenCalled();
    expect(confirmCreditBalance).toHaveBeenCalled();
    expect(uploadReceipt).toHaveBeenCalled();
    expect(confirmReceipt).toHaveBeenCalled();
    expect(claimWarranty).toHaveBeenCalled();
    expect(unclaimWarranty).toHaveBeenCalled();
    expect(snoozeWarranty).toHaveBeenCalled();
    expect(createCashbackClaim).toHaveBeenCalled();
    expect(markCashbackClaimed).toHaveBeenCalled();
  });
});

describe('wardrobe / outfit / capsule mutation matrix', () => {
  beforeEach(() => {
    sessionState.accessToken = 'test-token';
    useClosetStore.getState().clear();
  });

  it('loads week/goes-with/capsule/twins/complete-look and runs wardrobe mutations', async () => {
    let upload!: ReturnType<typeof useUploadWardrobeItem>['mutateAsync'];
    let bulk!: ReturnType<typeof useBulkUploadWardrobe>['mutateAsync'];
    let fromPurchases!: ReturnType<typeof useWardrobeFromPurchases>['mutateAsync'];
    let tryon!: ReturnType<typeof useWardrobeTryon>['mutateAsync'];
    let update!: ReturnType<typeof useUpdateWardrobeItem>['mutateAsync'];
    let care!: ReturnType<typeof useCareOcrWardrobeItem>['mutateAsync'];
    let drop!: ReturnType<typeof useDryCleanDropOff>['mutateAsync'];
    let confirmDc!: ReturnType<typeof useDryCleanConfirm>['mutateAsync'];
    let swap!: ReturnType<typeof useSeasonalSwap>['mutateAsync'];
    let travel!: ReturnType<typeof useTravelPack>['mutateAsync'];
    let work!: ReturnType<typeof useWorkwearRotation>['mutateAsync'];
    let cal!: ReturnType<typeof useOutfitsFromCalendar>['mutateAsync'];
    let wedding!: ReturnType<typeof useWeddingFestivalPlan>['mutateAsync'];
    let interview!: ReturnType<typeof useSaveInterviewKit>['mutateAsync'];
    let del!: ReturnType<typeof useDeleteWardrobeItem>['mutateAsync'];
    let alt!: ReturnType<typeof useOutfitAlternative>['mutateAsync'];
    let select!: ReturnType<typeof useSelectTodayOutfit>['mutateAsync'];
    let genWeek!: ReturnType<typeof useGenerateWeekOutfit>['mutateAsync'];
    let saveCap!: ReturnType<typeof useSaveCapsule>['mutateAsync'];
    let twinClick!: ReturnType<typeof useReplaceTwinClick>['mutateAsync'];
    let wearCh!: ReturnType<typeof useStartWearChallenge>['mutateAsync'];
    let declutter!: ReturnType<typeof useStartDeclutterChallenge>['mutateAsync'];
    let cpw!: ReturnType<typeof useSetCpwGoal>['mutateAsync'];
    let exportCsv!: ReturnType<typeof useExportAccountantCsv>['mutateAsync'];

    function Bundle() {
      const week = useWeekOutfits();
      const goes = useGoesWith('w1');
      const shoes = useShoeBagRotation('shoes');
      const missing = useMissingPieces(3);
      const capsule = useCapsule();
      const twins = useReplaceTwins('w1');
      const look = useCompleteLook(['w1']);
      const importable = useImportablePurchases();
      upload = useUploadWardrobeItem().mutateAsync;
      bulk = useBulkUploadWardrobe().mutateAsync;
      fromPurchases = useWardrobeFromPurchases().mutateAsync;
      tryon = useWardrobeTryon().mutateAsync;
      update = useUpdateWardrobeItem().mutateAsync;
      care = useCareOcrWardrobeItem().mutateAsync;
      drop = useDryCleanDropOff().mutateAsync;
      confirmDc = useDryCleanConfirm().mutateAsync;
      swap = useSeasonalSwap().mutateAsync;
      travel = useTravelPack().mutateAsync;
      work = useWorkwearRotation().mutateAsync;
      cal = useOutfitsFromCalendar().mutateAsync;
      wedding = useWeddingFestivalPlan().mutateAsync;
      interview = useSaveInterviewKit().mutateAsync;
      del = useDeleteWardrobeItem().mutateAsync;
      alt = useOutfitAlternative().mutateAsync;
      select = useSelectTodayOutfit().mutateAsync;
      genWeek = useGenerateWeekOutfit().mutateAsync;
      saveCap = useSaveCapsule().mutateAsync;
      twinClick = useReplaceTwinClick().mutateAsync;
      wearCh = useStartWearChallenge().mutateAsync;
      declutter = useStartDeclutterChallenge().mutateAsync;
      cpw = useSetCpwGoal().mutateAsync;
      exportCsv = useExportAccountantCsv().mutateAsync;
      if (
        [week, goes, shoes, missing, capsule, twins, look, importable].some((q) => q.isLoading)
      ) {
        return <span>loading</span>;
      }
      return (
        <span>
          week={week.data ? 'yes' : 'no'} goes={goes.data ? 'yes' : 'no'} cap=
          {capsule.data ? 'yes' : 'no'}
        </span>
      );
    }

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <Bundle />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText(/week=yes/)).toBeTruthy();
    }, { timeout: 5000 });
    expect(fetchWeekOutfits).toHaveBeenCalledWith('test-token', undefined, expect.any(AbortSignal));
    expect(fetchGoesWith).toHaveBeenCalledWith('test-token', 'w1');
    expect(fetchShoeBagRotation).toHaveBeenCalled();
    expect(fetchMissingPieces).toHaveBeenCalledWith('test-token', 3);
    expect(fetchCapsule).toHaveBeenCalled();
    expect(fetchReplaceTwins).toHaveBeenCalledWith('test-token', 'w1');
    expect(fetchCompleteLook).toHaveBeenCalledWith('test-token', ['w1']);

    await act(async () => {
      await upload({ imageUri: 'file:///w.jpg', meta: { category: 'TOP' } });
      await bulk({ imageUris: ['file:///a.jpg', 'file:///b.jpg'], meta: { category: 'TOP' } });
      await fromPurchases(['pi1']);
      await tryon('w1');
      await update({ id: 'w1', patch: { laundryStatus: 'CLEAN' } });
      await care({ id: 'w1', ocrText: 'dry clean only' });
      await care({ id: 'w1', imageUri: 'file:///care.jpg' });
      await drop({ id: 'w1', ticket: 'T1', pickupOn: '2026-09-05' });
      await confirmDc('w1');
      await swap({ season: 'summer' });
      await travel({ startDate: '2026-09-01', endDate: '2026-09-04' });
      await work({ commit: true });
      await cal({ events: [{ startAt: '2026-09-10T10:00:00Z', title: 'Wedding' }] });
      await wedding({ startDate: '2026-10-01', endDate: '2026-10-03', kind: 'wedding' });
      await interview({
        name: 'Interview kit',
        itemIds: ['w1'],
        eventAt: '2026-09-20T09:00:00Z',
      });
      await del('w1');
      await alt(1);
      await select({ outfitId: 'o1' });
      await genWeek({ fillWeek: true });
      await saveCap(['w1', 'w2']);
      await twinClick({ itemId: 'w1', listingId: 'l1', platform: 'myntra' });
      await wearCh('w1');
      await declutter({ target: 5 });
      await cpw({ itemId: 'w1', targetCpwMinor: 100 });
      await exportCsv();
    });

    expect(uploadWardrobeItem).toHaveBeenCalled();
    expect(uploadWardrobeItemsBulk).toHaveBeenCalled();
    expect(wardrobeFromPurchases).toHaveBeenCalled();
    expect(tryOnWardrobeItem).toHaveBeenCalled();
    expect(updateWardrobeItem).toHaveBeenCalled();
    expect(careOcrWardrobeItem).toHaveBeenCalled();
    expect(careOcrWardrobePhoto).toHaveBeenCalled();
    expect(dryCleanDropOff).toHaveBeenCalled();
    expect(dryCleanConfirm).toHaveBeenCalled();
    expect(seasonalSwapWardrobe).toHaveBeenCalled();
    expect(buildTravelPack).toHaveBeenCalled();
    expect(shareTextFile).toHaveBeenCalled();
    expect(planWorkwearWeek).toHaveBeenCalled();
    expect(outfitsFromCalendar).toHaveBeenCalled();
    expect(planWeddingFestival).toHaveBeenCalled();
    expect(saveInterviewKit).toHaveBeenCalled();
    expect(deleteWardrobeItem).toHaveBeenCalled();
    expect(fetchTodayOutfit).toHaveBeenCalledWith('test-token', { alt: 1 }, expect.any(AbortSignal));
    expect(selectTodayOutfit).toHaveBeenCalled();
    expect(generateWeekOutfit).toHaveBeenCalled();
    expect(saveCapsule).toHaveBeenCalled();
    expect(recordReplaceTwinClick).toHaveBeenCalled();
    expect(startWearChallenge).toHaveBeenCalled();
    expect(useClosetStore.getState().wearChallengeIds).toContain('w1');
    expect(startDeclutterChallenge).toHaveBeenCalled();
    expect(useClosetStore.getState().declutterChallengeStarted).toBe(true);
    expect(setCpwGoal).toHaveBeenCalled();
    expect(fetchAccountantExportCsv).toHaveBeenCalled();
  });

  it('completes wear challenge when logging the 3rd wear', async () => {
    useClosetStore.getState().startWearChallenge('w1');
    let wear!: ReturnType<typeof useLogWear>['mutateAsync'];
    function Bundle() {
      wear = useLogWear().mutateAsync;
      return <span>wear</span>;
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <Bundle />
      </QueryClientProvider>,
    );
    await act(async () => {
      await wear({ wardrobeItemId: 'w1', priorWearCount: 2 });
    });
    expect(useClosetStore.getState().wearChallengeIds).not.toContain('w1');
  });
});

describe('gift / fit / disposition / swap / household surface', () => {
  beforeEach(() => {
    sessionState.accessToken = 'test-token';
  });

  it('loads fit + disposition queries', async () => {
    function Bundle() {
      const measurements = useMeasurements();
      const templates = useTemplates('IN');
      const orders = useTailoringOrders();
      const order = useTailoringOrder('to1');
      const tailors = useFitTailors();
      const disposition = useDisposition();
      if ([measurements, templates, orders, order, tailors, disposition].some((q) => q.isLoading)) {
        return <span>loading</span>;
      }
      return (
        <span>
          fit={measurements.data ? 'yes' : 'no'} disp={disposition.data ? 'yes' : 'no'}
        </span>
      );
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Bundle />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText(/fit=yes/)).toBeTruthy();
    });
    expect(screen.getByText(/disp=yes/)).toBeTruthy();
  });

  it('loads swap / household / activity queries', async () => {
    function Bundle() {
      const swaps = useSwapCircles();
      const listings = useSwapListings('sc1');
      const households = useHouseholds();
      const hhWardrobe = useHouseholdWardrobe('hh1');
      const profiles = useClosetProfiles();
      const activity = useIngestionActivity();
      const eta = useRefundEtaBoard();
      const ideas = useRecipientIdeas('r1');
      if (
        [swaps, listings, households, hhWardrobe, profiles, activity, eta, ideas].some(
          (q) => q.isLoading,
        )
      ) {
        return <span>loading</span>;
      }
      return (
        <span>
          sw={swaps.data ? 'yes' : 'no'} hh={households.data ? 'yes' : 'no'} act=
          {activity.data ? 'yes' : 'no'}
        </span>
      );
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Bundle />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText(/sw=yes/)).toBeTruthy();
    });
    expect(screen.getByText(/hh=yes/)).toBeTruthy();
  });

  it('runs fit / swap / household mutations', async () => {
    let createMeas!: ReturnType<typeof useCreateMeasurement>['mutateAsync'];
    let createTailor!: ReturnType<typeof useCreateTailoringOrder>['mutateAsync'];
    let reorder!: ReturnType<typeof useReorderTailoringOrder>['mutateAsync'];
    let preview!: ReturnType<typeof useFitPreview>['mutateAsync'];
    let createSwap!: ReturnType<typeof useCreateSwapCircle>['mutateAsync'];
    let joinSwap!: ReturnType<typeof useJoinSwapCircle>['mutateAsync'];
    let borrow!: ReturnType<typeof useBorrowSwapListing>['mutateAsync'];
    let lend!: ReturnType<typeof useLendWardrobeItem>['mutateAsync'];
    let returnLent!: ReturnType<typeof useReturnLentWardrobeItem>['mutateAsync'];
    let createHh!: ReturnType<typeof useCreateHousehold>['mutateAsync'];
    let joinHh!: ReturnType<typeof useJoinHousehold>['mutateAsync'];
    let createProf!: ReturnType<typeof useCreateClosetProfile>['mutateAsync'];

    function Bundle() {
      createMeas = useCreateMeasurement().mutateAsync;
      createTailor = useCreateTailoringOrder().mutateAsync;
      reorder = useReorderTailoringOrder().mutateAsync;
      preview = useFitPreview().mutateAsync;
      createSwap = useCreateSwapCircle().mutateAsync;
      joinSwap = useJoinSwapCircle().mutateAsync;
      borrow = useBorrowSwapListing().mutateAsync;
      lend = useLendWardrobeItem().mutateAsync;
      returnLent = useReturnLentWardrobeItem().mutateAsync;
      createHh = useCreateHousehold().mutateAsync;
      joinHh = useJoinHousehold().mutateAsync;
      createProf = useCreateClosetProfile().mutateAsync;
      return <span>mut</span>;
    }

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <Bundle />
      </QueryClientProvider>,
    );

    const api = await import('@/src/api/client');
    await act(async () => {
      await createMeas({ points: { bust: 36 }, region: 'IN' });
      await createTailor({ templateId: 'tpl1' });
      await reorder('to1');
      await preview({ templateId: 'tpl1' });
      await createSwap('Friends');
      await joinSwap('INVITE');
      await borrow({ circleId: 'sc1', listingId: 'sl1' });
      await lend({ id: 'w1', lentTo: 'Ada', dueOn: '2026-09-30' });
      await returnLent('w1');
      await createHh('Home');
      await joinHh('HHCODE');
      await createProf({ name: 'Partner', kind: 'PARTNER' });
    });

    expect(api.createMeasurement).toHaveBeenCalled();
    expect(api.createTailoringOrder).toHaveBeenCalled();
    expect(api.reorderTailoringOrder).toHaveBeenCalled();
    expect(api.previewFitCustomization).toHaveBeenCalled();
    expect(api.createSwapCircle).toHaveBeenCalled();
    expect(api.joinSwapCircle).toHaveBeenCalled();
    expect(api.borrowSwapListing).toHaveBeenCalled();
    expect(api.lendWardrobeItem).toHaveBeenCalled();
    expect(api.returnLentWardrobeItem).toHaveBeenCalled();
    expect(api.createHousehold).toHaveBeenCalled();
    expect(api.joinHousehold).toHaveBeenCalled();
    expect(api.createClosetProfile).toHaveBeenCalled();
  });
});

describe('price-drop / EMI surface', () => {
  beforeEach(() => {
    sessionState.accessToken = 'test-token';
    vi.mocked(scanPriceDrops).mockClear();
    vi.mocked(fetchEmiPlans).mockClear();
    vi.mocked(payEmiPlan).mockClear();
  });

  it('loads price-drop scan and EMI plans; marks EMI paid', async () => {
    let pay!: ReturnType<typeof usePayEmi>['mutateAsync'];

    function Bundle() {
      const drops = usePriceDropScan();
      const emis = useEmiPlans('ACTIVE');
      pay = usePayEmi().mutateAsync;
      if ([drops, emis].some((q) => q.isLoading)) return <span>loading</span>;
      return (
        <span>
          drops={drops.data?.hits?.length ?? 0} emis={emis.data?.plans?.length ?? 0}
        </span>
      );
    }

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    render(
      <QueryClientProvider client={client}>
        <Bundle />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/drops=1/)).toBeTruthy();
    });
    expect(screen.getByText(/emis=1/)).toBeTruthy();
    expect(scanPriceDrops).toHaveBeenCalledWith('test-token');
    expect(fetchEmiPlans).toHaveBeenCalledWith('test-token', 'ACTIVE');

    await act(async () => {
      await pay({ id: 'emi1', amountMinor: 2500 });
    });
    expect(payEmiPlan).toHaveBeenCalledWith('test-token', 'emi1', { amountMinor: 2500 });
    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey?: unknown[] })?.queryKey?.[0]);
    expect(keys).toContain('emi-plans');
  });

  it('skips price-drop scan when disabled', async () => {
    function Bundle() {
      const drops = usePriceDropScan(false);
      return <span>en={drops.isFetching ? 'yes' : 'no'} fetched={drops.fetchStatus}</span>;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Bundle />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText(/en=no/)).toBeTruthy();
    });
    expect(scanPriceDrops).not.toHaveBeenCalled();
  });
});

describe('rto / lent / size-map / photo-dump / kit patch surface', () => {
  beforeEach(() => {
    sessionState.accessToken = 'test-token';
    vi.mocked(fetchRtoRecovery).mockClear();
    vi.mocked(startRtoRefund).mockClear();
    vi.mocked(createReturn).mockClear();
    vi.mocked(fetchLentWardrobe).mockClear();
    vi.mocked(deleteClosetProfile).mockClear();
    vi.mocked(fetchSizeMap).mockClear();
    vi.mocked(bookReturnPickup).mockClear();
    vi.mocked(runPhotoDumpFromUris).mockClear();
    vi.mocked(patchInterviewKit).mockClear();
    vi.mocked(patchWeekDayOutfit).mockClear();
  });

  it('covers RTO, lent, size-map, pickup, photo-dump, kit/week patches, profile delete', async () => {
    let startRto!: ReturnType<typeof useStartRtoRefund>['mutateAsync'];
    let createRet!: ReturnType<typeof useCreateReturn>['mutateAsync'];
    let delProf!: ReturnType<typeof useDeleteClosetProfile>['mutateAsync'];
    let book!: ReturnType<typeof useBookReturnPickup>['mutateAsync'];
    let dump!: ReturnType<typeof usePhotoDump>['mutateAsync'];
    let patchKit!: ReturnType<typeof usePatchInterviewKit>['mutateAsync'];
    let patchWeek!: ReturnType<typeof usePatchWeekOutfit>['mutateAsync'];

    function Bundle() {
      const rto = useRtoRecovery(true);
      const lent = useLentWardrobe('overdue');
      const sizeMap = useSizeMap();
      startRto = useStartRtoRefund().mutateAsync;
      createRet = useCreateReturn().mutateAsync;
      delProf = useDeleteClosetProfile().mutateAsync;
      book = useBookReturnPickup().mutateAsync;
      dump = usePhotoDump().mutateAsync;
      patchKit = usePatchInterviewKit().mutateAsync;
      patchWeek = usePatchWeekOutfit().mutateAsync;
      if ([rto, lent, sizeMap].some((q) => q.isLoading)) return <span>loading</span>;
      return (
        <span>
          rto={rto.data?.board?.length ?? 0} lent={lent.data?.items?.length ?? 0} size=
          {sizeMap.data ? 'yes' : 'no'}
        </span>
      );
    }

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <Bundle />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/rto=1/)).toBeTruthy();
    });
    expect(screen.getByText(/lent=1/)).toBeTruthy();
    expect(screen.getByText(/size=yes/)).toBeTruthy();
    expect(fetchRtoRecovery).toHaveBeenCalledWith('test-token', true);
    expect(fetchLentWardrobe).toHaveBeenCalledWith('test-token', { due: 'overdue' });
    expect(fetchSizeMap).toHaveBeenCalledWith('test-token');

    await act(async () => {
      await startRto({ purchaseId: 'p1', method: 'PICKUP' });
      await createRet({ purchaseId: 'p1', method: 'DROP_OFF' });
      await delProf('cp1');
      await book({ id: 'ret1', pickupSlotAt: '2026-09-01T10:00:00.000Z' });
      await dump({ imageUris: ['file:///a.jpg', 'file:///b.jpg'] });
      await patchKit({ id: 'kit1', cancelReminder: true });
      await patchWeek({ date: '2026-09-01', itemIds: ['w1'], occasion: 'WORK' });
    });

    expect(startRtoRefund).toHaveBeenCalledWith('test-token', 'p1', { method: 'PICKUP' });
    expect(createReturn).toHaveBeenCalled();
    expect(deleteClosetProfile).toHaveBeenCalledWith('test-token', 'cp1');
    expect(bookReturnPickup).toHaveBeenCalled();
    expect(runPhotoDumpFromUris).toHaveBeenCalledWith('test-token', [
      'file:///a.jpg',
      'file:///b.jpg',
    ]);
    expect(patchInterviewKit).toHaveBeenCalledWith('test-token', 'kit1', {
      cancelReminder: true,
    });
    expect(patchWeekDayOutfit).toHaveBeenCalledWith('test-token', '2026-09-01', {
      itemIds: ['w1'],
      occasion: 'WORK',
    });
  });
});

describe('credits undo/merge + price-watch + EMI SMS + household vault', () => {
  beforeEach(() => {
    sessionState.accessToken = 'test-token';
    vi.mocked(undoSpendCredit).mockClear();
    vi.mocked(mergeCredits).mockClear();
    vi.mocked(markCreditExpiryHandled).mockClear();
    vi.mocked(createBrandPriceWatch).mockClear();
    vi.mocked(createEmiFromSms).mockClear();
    vi.mocked(fetchHouseholdVault).mockClear();
    vi.mocked(patchHouseholdVaultMember).mockClear();
    vi.mocked(spendHouseholdVault).mockClear();
  });

  it('undoes spend, merges credits, marks expiry handled', async () => {
    let undo!: ReturnType<typeof useUndoSpendGiftCard>['mutateAsync'];
    let merge!: ReturnType<typeof useMergeCredits>['mutateAsync'];
    let expiry!: ReturnType<typeof useMarkCreditExpiryHandled>['mutateAsync'];

    function Bundle() {
      undo = useUndoSpendGiftCard().mutateAsync;
      merge = useMergeCredits().mutateAsync;
      expiry = useMarkCreditExpiryHandled().mutateAsync;
      return <span>credit-ops</span>;
    }

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <Bundle />
      </QueryClientProvider>,
    );

    await act(async () => {
      await undo({
        id: '11111111-1111-4111-8111-111111111111',
        idempotencyKey: 'idem-undo-1',
      });
      await merge({
        targetAccountId: '11111111-1111-4111-8111-111111111111',
        sourceAccountId: '33333333-3333-4333-8333-333333333333',
      });
      await expiry('11111111-1111-4111-8111-111111111111');
    });

    expect(undoSpendCredit).toHaveBeenCalledWith(
      'test-token',
      '11111111-1111-4111-8111-111111111111',
      { idempotencyKey: 'idem-undo-1' },
    );
    expect(mergeCredits).toHaveBeenCalled();
    expect(markCreditExpiryHandled).toHaveBeenCalledWith(
      'test-token',
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('creates price watch + EMI from SMS; loads/patches/spends household vault', async () => {
    let watch!: ReturnType<typeof useCreatePriceWatch>['mutateAsync'];
    let emiSms!: ReturnType<typeof useCreateEmiFromSms>['mutateAsync'];
    let patchMember!: ReturnType<typeof usePatchHouseholdVaultMember>['mutateAsync'];
    let spendVault!: ReturnType<typeof useSpendHouseholdVault>['mutateAsync'];

    function Bundle() {
      const vault = useHouseholdVault('hh1');
      watch = useCreatePriceWatch().mutateAsync;
      emiSms = useCreateEmiFromSms().mutateAsync;
      patchMember = usePatchHouseholdVaultMember('hh1').mutateAsync;
      spendVault = useSpendHouseholdVault('hh1').mutateAsync;
      if (vault.isLoading) return <span>loading</span>;
      return <span>vault={vault.data?.accounts?.length ?? 0}</span>;
    }

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    render(
      <QueryClientProvider client={client}>
        <Bundle />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/vault=1/)).toBeTruthy();
    });
    expect(fetchHouseholdVault).toHaveBeenCalledWith('test-token', 'hh1');

    await act(async () => {
      await watch({ brand: 'Nike', targetPriceMinor: 5000 } as never);
      await emiSms({ body: 'EMI of Rs 2500 due', from: 'HDFC' });
      await patchMember({ userId: 'u2', vaultAccess: 'SPEND', spendCapMinor: 10_000 });
      await spendVault({
        accountId: 'gc1',
        amountMinor: 500,
        idempotencyKey: 'idem-hh-1',
      });
    });

    expect(createBrandPriceWatch).toHaveBeenCalled();
    expect(createEmiFromSms).toHaveBeenCalledWith('test-token', {
      body: 'EMI of Rs 2500 due',
      from: 'HDFC',
    });
    expect(patchHouseholdVaultMember).toHaveBeenCalled();
    expect(spendHouseholdVault).toHaveBeenCalled();
    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey?: unknown[] })?.queryKey?.[0]);
    expect(keys).toContain('price-drop-scan');
    expect(keys).toContain('emi-plans');
    expect(keys).toContain('household-vault');
  });
});

describe('wardrobe paging, bulk edits and outfit alternatives', () => {
  beforeEach(() => {
    sessionState.accessToken = 'test-token';
    vi.mocked(fetchWardrobe).mockReset();
    vi.mocked(bulkUpdateWardrobeItems).mockClear();
    vi.mocked(fetchTodayOutfit).mockClear();
  });

  function wardrobeItem(id: string) {
    return { id, category: 'top', closetStatus: 'ACTIVE' } as never;
  }

  it('loads the wardrobe a page at a time and flattens the pages', async () => {
    vi.mocked(fetchWardrobe)
      .mockResolvedValueOnce({ items: [wardrobeItem('w1'), wardrobeItem('w2')], nextCursor: 'c2' })
      .mockResolvedValueOnce({ items: [wardrobeItem('w3')], nextCursor: null });
    let wardrobe!: ReturnType<typeof useWardrobe>;
    function Probe() {
      wardrobe = useWardrobe('p1', { limit: 2 });
      return <span data-testid="count">{wardrobe.data?.items.length ?? 0}</span>;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    expect(wardrobe.hasNextPage).toBe(true);
    await act(async () => {
      await wardrobe.fetchNextPage();
    });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('3'));
    expect(wardrobe.hasNextPage).toBe(false);
    expect(vi.mocked(fetchWardrobe).mock.calls.map((c) => c[2])).toEqual([
      { limit: 2, cursor: null },
      { limit: 2, cursor: 'c2' },
    ]);
  });

  it('keeps one cache entry per user and profile, not per token', async () => {
    vi.mocked(fetchWardrobe).mockResolvedValue({ items: [] });
    function Probe() {
      useWardrobe('p1');
      return null;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(fetchWardrobe).toHaveBeenCalled());
    const keys = client.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toEqual([['wardrobe', 'user-1', 'p1', 50]]);
  });

  it('sends a bulk edit in chunks of at most 200 unique ids', async () => {
    let bulk!: ReturnType<typeof useBulkUpdateWardrobe>['mutateAsync'];
    function Probe() {
      bulk = useBulkUpdateWardrobe().mutateAsync;
      return null;
    }
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`);

    let result!: Awaited<ReturnType<typeof bulk>>;
    await act(async () => {
      result = await bulk({ ids: [...ids, 'id-0', 'id-1'], patch: { closetStatus: 'STORED' } });
    });

    const calls = vi.mocked(bulkUpdateWardrobeItems).mock.calls;
    expect(calls.map((c) => c[1].length)).toEqual([200, 200, 50]);
    expect(new Set(calls.flatMap((c) => c[1])).size).toBe(450);
    expect(calls[0]![2]).toEqual({ closetStatus: 'STORED' });
    expect(result.updated).toHaveLength(450);
    expect(result.failedIds).toEqual([]);
    const invalidated = invalidate.mock.calls.map((c) => c[0]?.queryKey);
    expect(invalidated).toContainEqual(['wardrobe']);
  });

  it('reports the ids of a chunk that failed and keeps the rest', async () => {
    vi.mocked(bulkUpdateWardrobeItems)
      .mockImplementationOnce(async (_t, ids) => ({ items: ids.map((id) => ({ id }) as never) }))
      .mockRejectedValueOnce(new Error('Server error'));
    let bulk!: ReturnType<typeof useBulkUpdateWardrobe>['mutateAsync'];
    function Probe() {
      bulk = useBulkUpdateWardrobe().mutateAsync;
      return null;
    }
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);

    let result!: Awaited<ReturnType<typeof bulk>>;
    await act(async () => {
      result = await bulk({ ids, patch: { laundryStatus: 'DIRTY' } });
    });
    expect(result.updated).toHaveLength(200);
    expect(result.failedIds).toEqual(ids.slice(200));
  });

  it('rejects a bulk edit when nothing was updated', async () => {
    vi.mocked(bulkUpdateWardrobeItems).mockRejectedValueOnce(new Error('Server error'));
    let bulk!: ReturnType<typeof useBulkUpdateWardrobe>['mutateAsync'];
    function Probe() {
      bulk = useBulkUpdateWardrobe().mutateAsync;
      return null;
    }
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
    await expect(bulk({ ids: ['a'], patch: { laundryStatus: 'DIRTY' } })).rejects.toThrow(
      'Server error',
    );
  });

  it('caches each outfit alternative so going back does not refetch', async () => {
    let alt!: ReturnType<typeof useOutfitAlternative>['mutateAsync'];
    function Probe() {
      alt = useOutfitAlternative().mutateAsync;
      return null;
    }
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 60_000 }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
    await act(async () => {
      await alt(1);
      await alt(2);
      await alt(1);
    });
    expect(vi.mocked(fetchTodayOutfit).mock.calls.map((c) => c[1])).toEqual([{ alt: 1 }, { alt: 2 }]);
  });
});

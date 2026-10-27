import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  AppState,
  type AppStateStatus,
  Linking,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import type {
  AddCreditBody,
  ConfirmReceiptBody,
  ReceiptParsed,
} from '@worn/shared';
import {
  filterVaultAccounts,
  findNearDuplicateCredits,
  formatMinor,
  fractionDigits,
  getCopyPack,
  giftCardCapturePrefill,
  merchantDeepLink,
  nearDuplicateWarnCopy,
  normalizeMerchantKey,
  vaultSearchEmptyCopy,
  vaultSearchHasActiveFilters,
  WARRANTY_COVERAGE_PRESETS,
  inferWarrantyCategory,
  type VaultExpiryWindow,
  type WarrantyCategory,
} from '@worn/shared';
import { shareTextFile } from '@/src/lib/shareFile';
import { shareDataUrlFile } from '@/src/lib/shareDataUrlFile';

import {
  delightHapticFoundMoney,
  delightHapticForCelebrationSource,
} from '@/src/lib/delightHaptics';
import { formatClosetDate } from '@/src/lib/format';
import { useClosetPrefsStore } from '@/src/lib/closetPrefs';
import { parseAmountInput } from '@/src/lib/amountInput';
import { newIdempotencyKey } from '@/src/lib/idempotency';
import { addMonthsToDayKey, endOfDayKeyIso, localDayKey, parseDayKey } from '@/src/lib/localDay';
import { celebrationVariantForSource } from '@/src/lib/celebrationVariants';
import {
  gstInvoiceSearchPrefill,
  isGstFocus,
  type GstInvoiceSearchPrefill,
} from '@/src/lib/gstFromReturn';
import {
  enqueueVaultAdd,
  flushVaultAddQueue,
  queuedAddAsPendingAccount,
  readVaultAddQueue,
  type QueuedVaultAdd,
} from '@/src/lib/vaultAddQueue';
import { useNetworkStatus } from '@/src/hooks/closet/useNetworkStatus';

import { Button } from '@/src/components/ui';
import { ClosetScreen } from '@/src/components/ClosetScreen';
import { ClosetVirtualList } from '@/src/components/ClosetVirtualList';
import { ReturnsPanel } from '@/src/components/ReturnsPanel';
import { PackagesPanel } from '@/src/components/PackagesPanel';
import { CashbackClaimsPanel } from '@/src/components/CashbackClaimsPanel';
import { VaultPrivacyActions } from '@/src/components/VaultPrivacyActions';
import { VaultTrustStrip } from '@/src/components/VaultTrustStrip';
import { PriceDropAlertCards } from '@/src/components/PriceDropAlertCards';
import { EmiDontMissCards } from '@/src/components/EmiDontMissCards';
import { FoundMoneyCountUp } from '@/src/components/FoundMoneyCountUp';
import { ExpiryCountdownHero } from '@/src/components/ExpiryCountdownHero';
import { MultiCardStack } from '@/src/components/MultiCardStack';
import {
  useAddGiftCard,
  useBalanceCheck,
  useCaptureGiftCard,
  useClaimWarranty,
  useConfirmBalance,
  useConfirmReceipt,
  useExportReceipt,
  useGiftCards,
  useIngestionStatus,
  useMarkCreditExpiryHandled,
  useMergeCredits,
  useReceipts,
  useReturns,
  useSnoozeWarranty,
  useSpendGiftCard,
  useUndoSpendGiftCard,
  useUnclaimWarranty,
  useUploadReceipt,
  useWarranties,
} from '@/src/hooks/closet/useCloset';
import {
  RECEIPT_SNAP_HERO_HINT,
  RECEIPT_SNAP_HERO_LABEL,
  pickReceiptSnapImage,
} from '@/src/lib/receiptSnap';
import { expiryBadge } from '@/src/lib/expiryBadge';
import { CLOSET_OFF_SUBTITLE, closetAlertText } from '@/src/lib/closetScreenState';
import { FEATURE_CLOSET } from '@/src/lib/features';
import { warrantyBadge } from '@/src/lib/warrantyBadge';
import {
  confidenceBadge,
  requiresConfirmOverride,
} from '@/src/lib/confidenceBadge';
import {
  VAULT_GIFT_EMPTY_BODY,
  familyFoundMoneyShareFromAccounts,
  familyShareViaLabel,
  foundMoneyCurrencySubtotalsLine,
  foundMoneyHeadline,
  foundMoneyShareFromAccounts,
  foundMoneySubline,
  whatsAppInFoundMoneyShareFromAccounts,
  whatsAppStatusAssetFromAccounts,
} from '@/src/lib/foundMoney';
import { delightBarcodeCaptureSuccess } from '@/src/lib/barcodeCaptureDelight';
import { ApiRequestError, getMyReferral, recordClosetAffiliateClick, addCredit } from '@/src/api/client';
import {
  SAMPLE_MYNTRA_CREDIT,
  VAULT_FOUND_MONEY_HREF,
  demoExitedProps,
  timeToFoundMoneyProps,
} from '@/src/lib/firstDelight';
import {
  DEMO_BADGE_LABEL,
  demoAccountDisplayName,
  emptyCtaTapProps,
  emptyStateCopy,
  isDemoModeActive,
  isSampleCreditAccount,
} from '@/src/lib/emptyDemo';
import { returnConciergeCopy, returnCountdown } from '@/src/lib/returnCountdown';
import { trackEvent } from '@/src/lib/analytics';
import {
  USE_THIS_WEEKEND_LABEL,
  applySoonestFocusMode,
  balanceRecheckNudgeCopy,
  deeplinkSuccessToastCopy,
  expiryActionChecklist,
  expiryCountdownHero,
  groupVaultBalancesByCurrency,
  isExpiryHeroFocus,
  loyaltyFirstCelebrationCopy,
  loyaltyTabEmptyCopy,
  preferredCurrencyTotalMinor,
  shouldPlayVaultDelight,
  shouldShowBalanceRecheckNudge,
  shouldShowDeeplinkSuccessToast,
  shouldShowWeekendChip,
  shouldSoftBlockStaleUseNow,
  suggestVaultCreditMerges,
  weekendReminderCalendarUrl,
  type PendingDeeplinkOpen,
} from '@/src/lib/vaultWow';
import { CREDIT_SPEND_UNDO_WINDOW_MS } from '@worn/shared';
import { ProgressivePermPrompt } from '@/src/components/ProgressivePermPrompt';
import { useClosetStore } from '@/src/stores/closet';
import { useSessionStore } from '@/src/stores/session';
import {
  closet,
  fontSans,
  fsBody,
  fsCaption,
  radiusMd,
  space4,
  space6,
  text,
  textMuted,
} from '@/src/theme/tokens';

type Tab = 'gift' | 'loyalty' | 'coupons' | 'receipts' | 'warranties' | 'returns' | 'packages' | 'claims';
type CreditKind = 'GIFT_CARD' | 'LOYALTY_POINTS' | 'PROMO_CREDIT';

const CREDIT_TAB: Record<
  'gift' | 'loyalty' | 'coupons',
  {
    kind: CreditKind;
    noun: string;
    addLabel: string;
    emptyTitle: string;
    emptyBody: string;
  }
> = {
  gift: {
    kind: 'GIFT_CARD',
    noun: 'card',
    addLabel: 'Add a card',
    emptyTitle: 'Surface credit in under a minute',
    emptyBody: VAULT_GIFT_EMPTY_BODY,
  },
  loyalty: {
    kind: 'LOYALTY_POINTS',
    noun: 'balance',
    addLabel: 'Add loyalty',
    emptyTitle: 'Track loyalty points before they lapse',
    emptyBody:
      'Add a points balance with an expiry so WORN can nudge you before it disappears.',
  },
  coupons: {
    kind: 'PROMO_CREDIT',
    noun: 'coupon',
    addLabel: 'Add a coupon',
    emptyTitle: 'Park promo codes and coupons here',
    emptyBody:
      'Save a coupon or promo credit with its deadline — same expiry badges as gift cards.',
  },
};

function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  const state = expiryBadge(expiresAt);
  if (state === 'ok') return null;
  const label = state === 'expired' ? 'Expired' : 'Expires soon';
  return (
    <Text
      style={[
        styles.badge,
        state === 'expired' ? styles.badgeExpired : styles.badgeSoon,
      ]}
    >
      {label}
    </Text>
  );
}

function WarrantyBadge({
  coverageUntil,
  state,
}: {
  coverageUntil: string | null;
  state: string;
}) {
  const b = warrantyBadge({ coverageUntil, state });
  const tone =
    b.tone === 'expired'
      ? styles.badgeExpired
      : b.tone === 'soon'
        ? styles.badgeSoon
        : b.tone === 'claimed'
          ? styles.badgeClaimed
          : styles.badgeOk;
  return <Text style={[styles.badge, tone]}>{b.label}</Text>;
}

function ConfidenceBadge({ confidence }: { confidence: number | null | undefined }) {
  const b = confidenceBadge(confidence);
  const tone =
    b.tone === 'high'
      ? styles.badgeOk
      : b.tone === 'medium'
        ? styles.badgeSoon
        : styles.badgeExpired;
  return <Text style={[styles.badge, tone]}>{b.label}</Text>;
}

type EditItem = {
  title: string;
  priceMinor: number;
  /** What the user typed; "12." must survive a re-render, so it is parsed only on save. */
  priceText: string;
  warranty: boolean;
  coverageUntil: string;
  claimContact: string;
  category?: WarrantyCategory | null;
};

export default function ClosetVaultScreen() {
  const params = useLocalSearchParams<{
    focus?: string;
    merchant?: string;
    from?: string;
    to?: string;
  }>();
  const [tab, setTab] = useState<Tab>('gift');
  /** W009 — hero snap requests camera/OCR on receipts tab. */
  const [receiptSnapRequest, setReceiptSnapRequest] = useState(false);
  /** W041 — GST jump from returns prefills receipts search. */
  const [receiptSearchPrefill, setReceiptSearchPrefill] = useState<GstInvoiceSearchPrefill | null>(
    null,
  );
  const returns = useReturns();
  const gifts = useGiftCards('GIFT_CARD');
  const receipts = useReceipts();
  const warranties = useWarranties();
  const ingestion = useIngestionStatus();
  const demoAccount = useClosetStore((s) => s.demoAccount);
  const router = useRouter();
  const accessToken = useSessionStore((s) => s.accessToken);
  const { isOffline } = useNetworkStatus();
  const [offlineQueuedCount, setOfflineQueuedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void readVaultAddQueue().then((snap) => {
      if (!cancelled) setOfflineQueuedCount(snap.items.length);
    });
    return () => {
      cancelled = true;
    };
  }, [isOffline]);

  const onSnapReceiptFromHero = useCallback(() => {
    trackEvent('receipt_snap_hero');
    setTab('receipts');
    setReceiptSnapRequest(true);
  }, []);

  useEffect(() => {
    if (isExpiryHeroFocus(params.focus)) {
      setTab('gift');
      trackEvent('found_money_viewed');
      if (params.focus === 'expiry') {
        trackEvent('expiry_countdown_viewed', { source: 'deeplink' });
      }
    }
    if (params.focus === 'returns') {
      setTab('returns');
    }
    if (params.focus === 'packages') {
      setTab('packages');
    }
    if (params.focus === 'receipt-snap') {
      setTab('receipts');
      setReceiptSnapRequest(true);
    }
    if (isGstFocus(params.focus)) {
      setTab('receipts');
      const merchant = Array.isArray(params.merchant) ? params.merchant[0] : params.merchant;
      const from = Array.isArray(params.from) ? params.from[0] : params.from;
      const to = Array.isArray(params.to) ? params.to[0] : params.to;
      if (params.focus === 'gst' || merchant || from || to) {
        setReceiptSearchPrefill(
          gstInvoiceSearchPrefill({
            merchant,
            createdAt: from ? `${from}T00:00:00.000Z` : undefined,
            purchasedAt: from ? `${from}T00:00:00.000Z` : undefined,
          }),
        );
        // Prefer explicit from/to query params when present
        if (merchant || from || to) {
          setReceiptSearchPrefill({
            merchant: merchant?.trim() || undefined,
            from: from?.trim() || undefined,
            to: to?.trim() || undefined,
          });
        }
      }
    }
    if (params.focus === 'price-drop') {
      setTab('gift');
    }
    if (params.focus === 'warranty') {
      setTab('warranties');
    }
  }, [params.focus, params.merchant, params.from, params.to]);

  // The refetch functions are stable; the query objects are new on every render.
  const refetchGifts = gifts.refetch;
  const refetchReturns = returns.refetch;
  const refetchReceipts = receipts.refetch;
  const refetchWarranties = warranties.refetch;
  const refetchIngestion = ingestion.refetch;
  const onRefresh = useCallback(() => {
    void Promise.all([
      refetchGifts(),
      refetchReturns(),
      refetchReceipts(),
      refetchWarranties(),
      refetchIngestion(),
    ]);
  }, [refetchGifts, refetchReturns, refetchReceipts, refetchWarranties, refetchIngestion]);

  if (!FEATURE_CLOSET) {
    return (
      <ClosetScreen
        title="Vault"
        subtitle={CLOSET_OFF_SUBTITLE}
      />
    );
  }

  const hasAnyVaultContent =
    Boolean(demoAccount) ||
    (gifts.data?.accounts?.length ?? 0) > 0 ||
    (receipts.data?.receipts?.length ?? 0) > 0 ||
    (warranties.data?.warranties?.length ?? 0) > 0 ||
    (returns.data?.returns?.length ?? 0) > 0;
  const primaryLoading = gifts.isLoading && !gifts.isFetched;
  const primaryError = gifts.isError && !gifts.isFetched;

  const urgent = (returns.data?.returns ?? [])
    .filter((r) => r.state !== 'EXPIRED' && r.state !== 'REFUNDED' && r.state !== 'CANCELLED')
    .map((r) => ({ r, c: returnCountdown(r.windowDeadline) }))
    .filter(({ c }) => !c.expired && c.urgent)
    .sort((a, b) => a.c.daysLeft - b.c.daysLeft)[0];

  // Never full-screen-empty the vault: Gift Cards tab owns the found-money aha
  // (manual add / sample first). Gmail connect stays progressive after aha.
  return (
    <ClosetScreen
      title="Vault"
      subtitle="Forgotten credit, receipts, and return windows — money you’ve already paid for."
      loading={primaryLoading}
      loadingLabel="Opening your vault…"
      hasContent={hasAnyVaultContent || (gifts.isFetched && !primaryError)}
      error={primaryError ? closetAlertText(gifts.error) : null}
      onRetry={onRefresh}
      onRefresh={onRefresh}
      refreshing={
        gifts.isRefetching ||
        returns.isRefetching ||
        receipts.isRefetching ||
        warranties.isRefetching ||
        ingestion.isRefetching
      }
      offlineQueuedCount={offlineQueuedCount}
      onOfflineRetry={async () => {
        if (accessToken) {
          const snap = await flushVaultAddQueue((body) => addCredit(accessToken, body));
          setOfflineQueuedCount(snap.items.length);
        }
        onRefresh();
      }}
      skeletonRows={5}
    >
      <VaultTrustStrip />
      <ProgressivePermPrompt />
      <PriceDropAlertCards enabled={tab === 'gift'} />
      <EmiDontMissCards />

      {urgent && tab !== 'returns' ? (
        <View style={styles.urgency}>
          <Text style={styles.urgencyText}>
            {returnConciergeCopy({
              deadline: urgent.r.windowDeadline,
              itemTitle: urgent.r.itemTitle,
              merchant: urgent.r.merchant,
            })}
          </Text>
          <Button
            label="Open returns"
            size="sm"
            variant="secondary"
            onPress={() => {
              setTab('returns');
              router.setParams({ focus: 'returns' });
            }}
          />
        </View>
      ) : null}

      <View style={styles.tabs}>
        <TabButton label="Gift Cards" active={tab === 'gift'} onPress={() => setTab('gift')} />
        <TabButton label="Loyalty" active={tab === 'loyalty'} onPress={() => setTab('loyalty')} />
        <TabButton label="Coupons" active={tab === 'coupons'} onPress={() => setTab('coupons')} />
        <TabButton label="Receipts" active={tab === 'receipts'} onPress={() => setTab('receipts')} />
        <TabButton label="Warranties" active={tab === 'warranties'} onPress={() => setTab('warranties')} />
        <TabButton label="Returns" active={tab === 'returns'} onPress={() => setTab('returns')} />
        <TabButton label="Packages" active={tab === 'packages'} onPress={() => setTab('packages')} />
        <TabButton label="Claims" active={tab === 'claims'} onPress={() => setTab('claims')} />
      </View>

      {tab === 'gift' || tab === 'loyalty' || tab === 'coupons' ? (
        <CreditsKindTab tab={tab} onSnapReceipt={onSnapReceiptFromHero} />
      ) : null}
      {tab === 'receipts' ? (
        <ReceiptsTab
          autoSnap={receiptSnapRequest}
          onAutoSnapHandled={() => setReceiptSnapRequest(false)}
          initialSearch={receiptSearchPrefill}
        />
      ) : null}
      {tab === 'warranties' ? <WarrantiesTab /> : null}
      {tab === 'returns' ? <ReturnsPanel showLedgerRefunds /> : null}
      {tab === 'packages' ? <PackagesPanel /> : null}
      {tab === 'claims' ? <CashbackClaimsPanel /> : null}

      <VaultPrivacyActions />
    </ClosetScreen>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      label={label}
      variant={active ? 'primary' : 'secondary'}
      size="sm"
      onPress={onPress}
    />
  );
}

function CreditsKindTab({
  tab,
  onSnapReceipt,
}: {
  tab: 'gift' | 'loyalty' | 'coupons';
  onSnapReceipt?: () => void;
}) {
  const meta = CREDIT_TAB[tab];
  /** Gift tab includes store credit so U013 type chips can filter. */
  const { data, isLoading, isError } = useGiftCards(tab === 'gift' ? undefined : meta.kind);
  const addGiftCard = useAddGiftCard();
  const captureGiftCard = useCaptureGiftCard();
  const spendGiftCard = useSpendGiftCard();
  const undoSpendGiftCard = useUndoSpendGiftCard();
  const mergeCredits = useMergeCredits();
  const markExpiryHandled = useMarkCreditExpiryHandled();
  const balanceCheck = useBalanceCheck();
  const confirmBalance = useConfirmBalance();
  const router = useRouter();
  const accessToken = useSessionStore((s) => s.accessToken);
  const justConnected = useClosetStore((s) => s.justConnected);
  const celebrationSource = useClosetStore((s) => s.celebrationSource);
  const clearJustConnected = useClosetStore((s) => s.clearJustConnected);
  const demoAccount = useClosetStore((s) => s.demoAccount);
  const demoSampleDismissed = useClosetStore((s) => s.demoSampleDismissed);
  const seedDemoGiftCard = useClosetStore((s) => s.seedDemoGiftCard);
  const clearDemoGiftCard = useClosetStore((s) => s.clearDemoGiftCard);
  const exitDemoSample = useClosetStore((s) => s.exitDemoSample);
  const markJustConnected = useClosetStore((s) => s.markJustConnected);
  const preferredCurrency = useClosetPrefsStore((s) => s.preferredCurrency);
  const emptyCopyVariant = useClosetPrefsStore((s) => s.emptyCopyVariant);
  const copyPackId = useClosetPrefsStore((s) => s.copyPackId);
  const copyPack = getCopyPack(copyPackId);
  const { isOffline } = useNetworkStatus();
  const [pendingQueue, setPendingQueue] = useState<QueuedVaultAdd[]>([]);
  const [flushError, setFlushError] = useState<string | null>(null);
  const [shareViaLabel, setShareViaLabel] = useState<string | null>(null);
  /** The user's own referral code once fetched, so sharing does not ask the API again. */
  const [myReferralCode, setMyReferralCode] = useState<string | null>(null);
  const markFoundMoneyTracked = useClosetStore((s) => s.markFoundMoneyTracked);
  const markDeadlineSetup = useClosetStore((s) => s.markDeadlineSetup);
  const startDelightClock = useClosetStore((s) => s.startDelightClock);
  const soonestFocusMode = useClosetStore((s) => s.soonestFocusMode);
  const setSoonestFocusMode = useClosetStore((s) => s.setSoonestFocusMode);
  const loyaltyJustAdded = useClosetStore((s) => s.loyaltyJustAdded);
  const loyaltyCelebrationKind = useClosetStore((s) => s.loyaltyCelebrationKind);
  const markLoyaltyJustAdded = useClosetStore((s) => s.markLoyaltyJustAdded);
  const clearLoyaltyJustAdded = useClosetStore((s) => s.clearLoyaltyJustAdded);
  const params = useLocalSearchParams<{ focus?: string }>();

  useEffect(() => {
    startDelightClock();
  }, [startDelightClock]);

  useEffect(() => {
    trackEvent('found_money_viewed');
  }, []);

  useEffect(() => {
    const token = useSessionStore.getState().accessToken;
    if (!token) return;
    let cancelled = false;
    void getMyReferral(token)
      .then((me) => {
        if (cancelled || !me.referralCode || me.referralCode === 'PENDING') return;
        setMyReferralCode(me.referralCode);
        setShareViaLabel(familyShareViaLabel(`https://worn.app/r/${me.referralCode}`));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (justConnected && tab === 'gift') {
      void delightHapticForCelebrationSource(celebrationSource ?? 'oauth');
    }
  }, [justConnected, tab, celebrationSource]);

  useEffect(() => {
    let cancelled = false;
    void readVaultAddQueue().then((snap) => {
      if (cancelled) return;
      setPendingQueue(snap.items);
      setFlushError(snap.lastFlushError);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isOffline || !accessToken || tab !== 'gift') return;
    let cancelled = false;
    void flushVaultAddQueue((body) => addCredit(accessToken, body)).then((snap) => {
      if (cancelled) return;
      setPendingQueue(snap.items);
      setFlushError(snap.lastFlushError);
    });
    return () => {
      cancelled = true;
    };
  }, [isOffline, accessToken, tab]);

  useEffect(() => {
    if (!loyaltyJustAdded) return;
    if (tab !== 'loyalty' && tab !== 'coupons') return;
    if (loyaltyCelebrationKind !== tab) return;
    void (async () => {
      const reduce = await AccessibilityInfo.isReduceMotionEnabled();
      if (shouldPlayVaultDelight(reduce)) {
        void delightHapticFoundMoney();
      }
      trackEvent('loyalty_first_celebration', { kind: tab });
    })();
  }, [loyaltyJustAdded, loyaltyCelebrationKind, tab]);

  const [adding, setAdding] = useState(false);
  const [merchant, setMerchant] = useState('');
  const [balance, setBalance] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cardCode, setCardCode] = useState('');
  const [last4, setLast4] = useState('');
  const [barcodeRaw, setBarcodeRaw] = useState('');
  const [capture, setCapture] = useState<AddCreditBody['capture']>(undefined);
  const [spendingId, setSpendingId] = useState<string | null>(null);
  const [spendAmount, setSpendAmount] = useState('');
  const [undoSpend, setUndoSpend] = useState<{
    accountId: string;
    amountMinor: number;
    idempotencyKey: string;
    until: number;
  } | null>(null);
  const [expiryHandledIds, setExpiryHandledIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [recheckingId, setRecheckingId] = useState<string | null>(null);
  const [recheckAmount, setRecheckAmount] = useState('');
  const [deeplinkToast, setDeeplinkToast] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [expiryWindow, setExpiryWindow] = useState<VaultExpiryWindow>('any');
  const [balancePositiveOnly, setBalancePositiveOnly] = useState(false);
  /** U013 — type chip within gift tab (gift card vs store credit). */
  const [typeKindFilter, setTypeKindFilter] = useState<'all' | 'GIFT_CARD' | 'STORE_CREDIT'>(
    'all',
  );
  const pendingDeeplink = useRef<PendingDeeplinkOpen | null>(null);
  /** One key per card being added, so a retried save never mints a second card. */
  const addKeyRef = useRef<string | null>(null);
  const highlightExpiry = isExpiryHeroFocus(params.focus);

  useEffect(() => {
    const t = setTimeout(() => setSearchQ(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const apiAccounts = useMemo(
    () =>
      (data?.accounts ?? [])
        .filter((a) => {
          if (tab === 'gift') {
            return a.kind === 'GIFT_CARD' || a.kind === 'STORE_CREDIT';
          }
          return true;
        })
        .filter((a) => {
          if (!demoSampleDismissed) return true;
          return !isSampleCreditAccount(a);
        }),
    [data?.accounts, tab, demoSampleDismissed],
  );
  const showDemo =
    tab === 'gift' &&
    Boolean(demoAccount) &&
    !apiAccounts.some(
      (a) =>
        a.merchant === demoAccount!.merchant &&
        a.balanceCacheMinor === demoAccount!.balanceCacheMinor,
    );
  const rawAccounts = useMemo(
    () => [
      ...(showDemo && demoAccount ? [demoAccount] : []),
      ...(tab === 'gift' ? pendingQueue.map(queuedAddAsPendingAccount) : []),
      ...apiAccounts,
    ],
    [showDemo, demoAccount, tab, pendingQueue, apiAccounts],
  );
  const focusedAccounts = useMemo(
    () => applySoonestFocusMode(rawAccounts, soonestFocusMode && tab === 'gift'),
    [rawAccounts, soonestFocusMode, tab],
  );
  const searchFilters = useMemo(
    () => ({
      q: searchQ,
      expiryWindow,
      balancePositive: balancePositiveOnly,
      kinds:
        tab === 'gift' && typeKindFilter !== 'all' ? [typeKindFilter] : undefined,
    }),
    [searchQ, expiryWindow, balancePositiveOnly, tab, typeKindFilter],
  );
  const accounts = useMemo(
    () => filterVaultAccounts(focusedAccounts, searchFilters),
    [focusedAccounts, searchFilters],
  );
  const searchActive = vaultSearchHasActiveFilters(searchFilters);
  const currencySubtotals = groupVaultBalancesByCurrency(accounts);
  const totalMinor = preferredCurrencyTotalMinor(accounts, preferredCurrency);
  const currencySubtotalsLine = foundMoneyCurrencySubtotalsLine(
    currencySubtotals,
    preferredCurrency,
  );
  const mergeSuggestions =
    tab === 'gift'
      ? suggestVaultCreditMerges(
          apiAccounts.map((a) => ({
            id: a.id,
            merchant: a.merchant,
            currency: a.currency,
            kind: a.kind,
            balanceCacheMinor: a.balanceCacheMinor,
            status: a.status,
            expiresAt: a.expiresAt,
          })),
        )
      : [];
  const vaultEmpty = emptyStateCopy('vault', emptyCopyVariant, copyPackId);
  const expiryHero = expiryCountdownHero(rawAccounts);
  const expiryChecklistAccount =
    tab === 'gift' && expiryHero
      ? rawAccounts.find((a) => a.id === expiryHero.accountId)
      : undefined;
  const expiryChecklist =
    expiryChecklistAccount && !expiryHandledIds.has(expiryChecklistAccount.id)
      ? expiryActionChecklist({
          merchant: expiryChecklistAccount.merchant,
          expiresAt: expiryChecklistAccount.expiresAt,
          link: 'link' in expiryChecklistAccount ? expiryChecklistAccount.link : null,
          balanceCacheMinor: expiryChecklistAccount.balanceCacheMinor,
        })
      : null;
  const loyaltyEmpty = tab === 'loyalty' || tab === 'coupons' ? loyaltyTabEmptyCopy(tab) : null;

  useEffect(() => {
    if (!expiryHero || tab !== 'gift') return;
    trackEvent('expiry_countdown_viewed', {
      source: highlightExpiry ? 'deeplink' : 'vault',
      daysLeft: expiryHero.countdown.daysLeft,
    });
  }, [expiryHero?.accountId, tab, highlightExpiry]);

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next !== 'active') return;
      const pending = pendingDeeplink.current;
      if (!shouldShowDeeplinkSuccessToast(pending)) return;
      pendingDeeplink.current = null;
      setDeeplinkToast(deeplinkSuccessToastCopy());
      trackEvent('merchant_deeplink_return', {
        platform: pending?.platform ?? 'other',
      });
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  function trackDelight(source: 'manual' | 'oauth' | 'demo') {
    const state = useClosetStore.getState();
    if (state.foundMoneyTracked) return;
    const props = timeToFoundMoneyProps(state.delightStartedAt, source);
    if (props) {
      trackEvent('time_to_found_money', props);
      markFoundMoneyTracked();
    }
  }

  function submitAdd(opts?: { forceDuplicate?: boolean; nearDuplicateOf?: string }) {
    const balanceMinor = parseAmountInput(balance, preferredCurrency);
    if (!merchant.trim() || balanceMinor === null) {
      Alert.alert('Enter a merchant and a valid balance');
      return;
    }
    // The card lapses at the end of that day on this phone; `new Date('31/12')` was Invalid Date and threw.
    const expiresAt = expiry.trim() ? endOfDayKeyIso(expiry) : null;
    if (expiry.trim() && !expiresAt) {
      Alert.alert('Check the expiry date', 'Enter it as YYYY-MM-DD, for example 2026-12-31.');
      return;
    }
    if (!opts?.forceDuplicate) {
      const dups = findNearDuplicateCredits(apiAccounts, {
        merchant: merchant.trim(),
        balanceMinor,
      });
      if (dups.length > 0) {
        const existing = dups[0]!;
        Alert.alert('Possible duplicate', nearDuplicateWarnCopy(existing.merchant), [
          {
            text: 'Open existing',
            onPress: () => {
              setAdding(false);
              setSpendingId(null);
              Alert.alert(
                existing.merchant,
                `Balance ${formatMinor(existing.balanceCacheMinor, preferredCurrency)} — already in your vault.`,
              );
            },
          },
          {
            text: 'Add anyway',
            style: 'destructive',
            onPress: () =>
              submitAdd({ forceDuplicate: true, nearDuplicateOf: existing.id }),
          },
          { text: 'Cancel', style: 'cancel' },
        ]);
        return;
      }
    }
    const payload: AddCreditBody = {
      kind: meta.kind,
      merchant: merchant.trim(),
      currency: preferredCurrency,
      balanceMinor,
      expiresAt,
      idempotencyKey: (addKeyRef.current ??= newIdempotencyKey()),
      ...(opts?.forceDuplicate
        ? {
            forceDuplicate: true,
            nearDuplicateOf: opts.nearDuplicateOf,
          }
        : {}),
      ...(capture
        ? {
            capture: {
              ...capture,
              code: cardCode.trim() || capture.code,
              last4: last4.trim() || capture.last4,
              raw: barcodeRaw.trim() || capture.raw,
            },
          }
        : cardCode.trim() || last4.trim()
          ? {
              capture: {
                source: 'BARCODE' as const,
                code: cardCode.trim() || undefined,
                last4: last4.trim() || undefined,
                raw: barcodeRaw.trim() || undefined,
              },
            }
          : {}),
    };

    const finishLocalSuccess = () => {
      addKeyRef.current = null;
      clearDemoGiftCard();
      if (tab === 'loyalty' || tab === 'coupons') {
        markLoyaltyJustAdded(tab);
      } else {
        markJustConnected('manual');
      }
      trackDelight('manual');
      if (payload.expiresAt) {
        markDeadlineSetup();
      }
      setAdding(false);
      setMerchant('');
      setBalance('');
      setExpiry('');
      setCardCode('');
      setLast4('');
      setBarcodeRaw('');
      setCapture(undefined);
      if (tab === 'gift') {
        router.replace(VAULT_FOUND_MONEY_HREF as never);
      }
    };

    if (tab === 'gift' && (isOffline || !accessToken)) {
      void enqueueVaultAdd(payload).then((item) => {
        setPendingQueue((prev) =>
          prev.some((p) => p.id === item.id) ? prev : [...prev, item],
        );
        setFlushError(null);
        finishLocalSuccess();
      });
      return;
    }

    addGiftCard.mutate(payload, {
      onSuccess: () => finishLocalSuccess(),
      onError: (e) => {
        // A 4xx is an answer (bad input, no consent): queueing it would retry forever
        // and show a "pending" card that never lands. Network failures, 5xx, 408 and 429 retry.
        const answered =
          e instanceof ApiRequestError &&
          e.status >= 400 &&
          e.status < 500 &&
          e.status !== 408 &&
          e.status !== 429;
        if (tab === 'gift' && !answered) {
          void enqueueVaultAdd(payload).then((item) => {
            setPendingQueue((prev) =>
              prev.some((p) => p.id === item.id) ? prev : [...prev, item],
            );
            setFlushError(closetAlertText(e));
            finishLocalSuccess();
          });
          return;
        }
        Alert.alert(`Could not add ${meta.noun}`, closetAlertText(e));
      },
    });
  }

  function applyBarcodeParse(raw: string) {
    const prefill = giftCardCapturePrefill({ barcode: raw });
    if (prefill.merchant) setMerchant(prefill.merchant);
    setCardCode(prefill.code ?? '');
    setLast4(prefill.last4 ?? prefill.codeLast4 ?? '');
    setBarcodeRaw(raw);
    setCapture({
      source: 'BARCODE',
      raw,
      code: prefill.code || undefined,
      last4: prefill.last4 || prefill.codeLast4 || undefined,
    });
  }

  function scanBarcodeViaApi() {
    const raw = barcodeRaw.trim();
    if (raw.length < 4) {
      Alert.alert('Enter a barcode', 'Paste or type the barcode, then tap Scan.');
      return;
    }
    applyBarcodeParse(raw);
    captureGiftCard.mutate(
      { mode: 'barcode', barcode: raw },
      {
        onSuccess: (res) => {
          if (res.merchant) setMerchant(res.merchant);
          if (res.code) setCardCode(res.code);
          if (res.last4) setLast4(res.last4);
          if (res.suggestedBalanceMinor != null && res.suggestedBalanceMinor > 0) {
            setBalance(String(res.suggestedBalanceMinor / 100));
          }
          setCapture(res.capture);
          void delightBarcodeCaptureSuccess().then((delight) => {
            Alert.alert(
              delight.confetti ? 'Captured — nice' : 'Confirm balance',
              delight.confetti
                ? 'Barcode locked in. Confirm the balance, then save.'
                : 'Barcode fields prefilled — confirm the balance, then save.',
            );
          });
        },
        onError: (e) => Alert.alert('Could not scan', closetAlertText(e)),
      },
    );
  }

  async function photoCaptureCard() {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    }).catch(async () =>
      ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      }),
    );
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setAdding(true);
    captureGiftCard.mutate(
      {
        mode: 'photo',
        imageUri: result.assets[0].uri,
        barcode: barcodeRaw.trim() || undefined,
      },
      {
        onSuccess: (res) => {
          if (res.merchant) setMerchant(res.merchant);
          if (res.code) setCardCode(res.code);
          if (res.last4) setLast4(res.last4);
          if (res.suggestedBalanceMinor != null && res.suggestedBalanceMinor > 0) {
            setBalance(String(res.suggestedBalanceMinor / 100));
          }
          setCapture(res.capture);
          void delightBarcodeCaptureSuccess().then((delight) => {
            Alert.alert(
              delight.confetti ? 'Captured — nice' : 'Confirm balance',
              delight.confetti
                ? 'Photo locked in. Review merchant / last4 and confirm the balance.'
                : 'Photo scanned — review merchant / last4 and confirm the card balance.',
            );
          });
        },
        onError: (e) => Alert.alert('Could not read card', closetAlertText(e)),
      },
    );
  }

  function trySample() {
    // The sample lives on this phone only: it records no consent and writes nothing to the server.
    seedDemoGiftCard();
    trackDelight('demo');
    router.replace(VAULT_FOUND_MONEY_HREF as never);
  }

  function currencyOf(id: string): string {
    return rawAccounts.find((a) => a.id === id)?.currency ?? preferredCurrency;
  }

  function submitSpend(id: string) {
    if (demoAccount && id === demoAccount.id) {
      Alert.alert('Sample card', 'Add a real card to track spends.');
      return;
    }
    const amountMinor = parseAmountInput(spendAmount, currencyOf(id));
    if (amountMinor === null) {
      Alert.alert('Enter a valid amount');
      return;
    }
    spendGiftCard.mutate(
      { id, amountMinor },
      {
        onSuccess: (result) => {
          setSpendingId(null);
          setSpendAmount('');
          setUndoSpend({
            accountId: id,
            amountMinor,
            idempotencyKey: result.idempotencyKey,
            until: Date.now() + CREDIT_SPEND_UNDO_WINDOW_MS,
          });
        },
        onError: (e) => Alert.alert('Could not spend', closetAlertText(e)),
      },
    );
  }

  function undoLastSpend() {
    if (!undoSpend || Date.now() > undoSpend.until) {
      setUndoSpend(null);
      Alert.alert('Undo window expired', 'Spends can only be undone within 60 seconds.');
      return;
    }
    undoSpendGiftCard.mutate(
      { id: undoSpend.accountId, idempotencyKey: undoSpend.idempotencyKey },
      {
        onSuccess: () => setUndoSpend(null),
        onError: (e) => Alert.alert('Could not undo', closetAlertText(e)),
      },
    );
  }

  function confirmMerge(suggestion: {
    targetAccountId: string;
    sourceAccountId: string;
    merchant: string;
  }) {
    Alert.alert(
      'Merge cards?',
      `Combine duplicate ${suggestion.merchant} balances into one account.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge',
          onPress: () =>
            mergeCredits.mutate(
              {
                targetAccountId: suggestion.targetAccountId,
                sourceAccountId: suggestion.sourceAccountId,
              },
              {
                onError: (e) =>
                  Alert.alert('Could not merge', closetAlertText(e)),
              },
            ),
        },
      ],
    );
  }

  function runBalanceCheck(id: string, merchantName: string) {
    if (demoAccount && id === demoAccount.id) {
      Alert.alert('Sample card', 'Add a real card to re-check balances.');
      return;
    }
    trackEvent('balance_recheck_tap', {
      platform: normalizeMerchantKey(merchantName) || 'other',
    });
    balanceCheck.mutate(id, {
      onSuccess: (result) => {
        if (result.mode === 'api' && result.refreshed) {
          Alert.alert(
            'Balance updated',
            `${merchantName}: ${formatMinor(result.balanceMinor, currencyOf(id))}`,
          );
          return;
        }
        if (result.checkUrl) {
          Alert.alert(
            'Re-check on merchant',
            result.message,
            [
              {
                text: 'Open merchant',
                onPress: () => {
                  Linking.openURL(result.checkUrl!).catch(() =>
                    Alert.alert('Could not open link'),
                  );
                },
              },
              {
                text: 'Enter balance',
                onPress: () => {
                  setRecheckingId(id);
                  setRecheckAmount(String(result.balanceMinor / 100));
                },
              },
              { text: 'Later', style: 'cancel' },
            ],
          );
          return;
        }
        setRecheckingId(id);
        setRecheckAmount(String(result.balanceMinor / 100));
      },
      onError: (e) => Alert.alert('Balance check failed', closetAlertText(e)),
    });
  }

  function openMerchantDeepLink(
    account: {
      id: string;
      merchant: string;
      link?: string | null;
      isDemo?: boolean;
      balanceCheckDue?: boolean;
      balanceCacheMinor?: number;
    },
    source: 'vault_use_it_now' | 'use_this_weekend',
  ) {
    if (account.isDemo) {
      Alert.alert('Sample card', 'Add a real card to open a merchant link.');
      return;
    }

    const proceed = () => {
      const url = account.link ?? merchantDeepLink(account.merchant);
      if (!url) {
        setSpendingId(account.id);
        return;
      }
      const platform = normalizeMerchantKey(account.merchant) || 'other';
      trackEvent('affiliate_click', {
        merchant: account.merchant,
        url,
        source,
      });
      if (source === 'use_this_weekend') {
        trackEvent('use_this_weekend_tap', { platform });
      }
      if (accessToken) {
        void recordClosetAffiliateClick(accessToken, {
          source,
          platform,
          url,
        });
      }
      pendingDeeplink.current = { openedAt: Date.now(), platform };
      Linking.openURL(url).catch(() => {
        pendingDeeplink.current = null;
        Alert.alert('Could not open merchant link');
      });
    };

    // U004 — soft-block Use it now when balance is stale.
    if (
      source === 'vault_use_it_now' &&
      shouldSoftBlockStaleUseNow(account.balanceCheckDue)
    ) {
      Alert.alert(
        'Balance may be stale',
        'Re-check with the merchant, or confirm the vault balance is still right.',
        [
          {
            text: 'Recheck',
            onPress: () => runBalanceCheck(account.id, account.merchant),
          },
          {
            text: 'I confirm',
            onPress: () => {
              trackEvent('stale_balance_override', {
                accountId: account.id,
                platform: normalizeMerchantKey(account.merchant) || 'other',
              });
              const balanceMinor = account.balanceCacheMinor ?? 0;
              confirmBalance.mutate(
                { id: account.id, balanceMinor },
                {
                  onSuccess: () => proceed(),
                  onError: () => proceed(),
                },
              );
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }

    proceed();
  }

  function planWeekend(account: {
    id: string;
    merchant: string;
    link?: string | null;
    isDemo?: boolean;
  }) {
    if (account.isDemo) {
      Alert.alert('Sample card', 'Add a real card to plan a weekend spend.');
      return;
    }
    const platform = normalizeMerchantKey(account.merchant) || 'other';
    trackEvent('use_this_weekend_tap', { platform, action: 'chip' });
    Alert.alert(
      USE_THIS_WEEKEND_LABEL,
      'Open the merchant now, or add a Saturday reminder to your calendar.',
      [
        {
          text: 'Open merchant',
          onPress: () => openMerchantDeepLink(account, 'use_this_weekend'),
        },
        {
          text: 'Remind me Sat',
          onPress: () => {
            const calUrl = weekendReminderCalendarUrl(account.merchant);
            Linking.openURL(calUrl).catch(() =>
              Alert.alert('Could not open calendar'),
            );
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  function scheduleBalanceReminder(account: {
    id: string;
    merchant: string;
    link?: string | null;
    balanceCheck?: { checkUrl: string | null };
  }) {
    trackEvent('balance_recheck_reminder', {
      platform: normalizeMerchantKey(account.merchant) || 'other',
    });
    const checkUrl =
      account.balanceCheck?.checkUrl ?? merchantDeepLink(account.merchant);
    Alert.alert(
      'Reminder set',
      'We’ll nudge you to re-check this balance. You can also confirm it on the merchant site now.',
      checkUrl
        ? [
            {
              text: 'Open merchant',
              onPress: () => {
                Linking.openURL(checkUrl).catch(() =>
                  Alert.alert('Could not open link'),
                );
              },
            },
            { text: 'OK' },
          ]
        : [{ text: 'OK' }],
    );
  }

  function submitRecheck(id: string) {
    // A spent-down card is a real answer, so "0" is allowed here.
    const balanceMinor = /^0+([.,]0*)?$/.test(recheckAmount.trim())
      ? 0
      : parseAmountInput(recheckAmount, currencyOf(id));
    if (balanceMinor === null) {
      Alert.alert('Enter a valid balance');
      return;
    }
    confirmBalance.mutate(
      { id, balanceMinor },
      {
        onSuccess: () => {
          setRecheckingId(null);
          setRecheckAmount('');
        },
        onError: (e) =>
          Alert.alert('Could not save balance', closetAlertText(e)),
      },
    );
  }

  const celebrationVariant =
    justConnected && tab === 'gift'
      ? celebrationVariantForSource(
          totalMinor,
          celebrationSource ?? 'oauth',
          preferredCurrency,
        )
      : null;
  const loyaltyCelebration =
    loyaltyJustAdded &&
    (tab === 'loyalty' || tab === 'coupons') &&
    loyaltyCelebrationKind === tab
      ? loyaltyFirstCelebrationCopy(totalMinor, tab)
      : null;

  async function shareFoundMoney() {
    // A sample card is not money the user found; it never goes into a share.
    const shareAccounts = accounts.filter((a) => !isSampleCreditAccount(a));
    if (preferredCurrencyTotalMinor(shareAccounts, preferredCurrency) <= 0) {
      Alert.alert('Nothing to share yet', 'Add a real card first. The sample card is not shared.');
      return;
    }
    try {
      const token = useSessionStore.getState().accessToken;
      // Without the user's own code the share carries no referral link; it never borrows a made-up one.
      let referralCode: string | null = myReferralCode;
      if (!referralCode && token) {
        try {
          const me = await getMyReferral(token);
          if (me.referralCode && me.referralCode !== 'PENDING') {
            referralCode = me.referralCode;
            setMyReferralCode(me.referralCode);
          }
        } catch {
          // share still works without live referral fetch
        }
      }
      const family = referralCode
        ? familyFoundMoneyShareFromAccounts(shareAccounts, referralCode)
        : null;
      const plain = family ?? foundMoneyShareFromAccounts(shareAccounts);
      const wa = whatsAppInFoundMoneyShareFromAccounts(shareAccounts, {
        deepLink: family?.deepLink ?? null,
      });
      const reels = foundMoneyShareFromAccounts(shareAccounts, { blurPreset: 'reels' });
      const status = whatsAppStatusAssetFromAccounts(shareAccounts, {
        deepLink: family?.deepLink ?? null,
      });
      setShareViaLabel(family ? familyShareViaLabel(family.deepLink) : null);
      Alert.alert(
        copyPack.vault.shareCta,
        'WhatsApp / Reels / Status blur totals — no merchants or card digits.',
        [
          {
            text: 'WhatsApp',
            onPress: () => {
              void Linking.openURL(wa.whatsAppUrl).catch(() => {
                void Share.share({ message: wa.shareText });
              });
              trackEvent('found_money_wa_share', {
                totalMinor: wa.totalMinor,
                accountCount: shareAccounts.length,
              });
            },
          },
          {
            text: 'More…',
            onPress: () => {
              Alert.alert('Share style', 'Reels + Status use extra blur (no PII).', [
                {
                  text: 'Reels (blur)',
                  onPress: () => {
                    void Share.share({ message: reels.shareText, title: reels.headline });
                    trackEvent('found_money_share_card', {
                      totalMinor: reels.totalMinor,
                      accountCount: reels.accountCount,
                      blurPreset: 'reels',
                    });
                  },
                },
                {
                  text: 'WA Status',
                  onPress: () => {
                    void Share.share({ message: status.shareText, title: status.headline });
                    trackEvent('found_money_share_card', {
                      totalMinor: plain.totalMinor,
                      accountCount: shareAccounts.length,
                      blurPreset: 'wa_status',
                    });
                  },
                },
                {
                  text: 'Share sheet',
                  onPress: () => {
                    void Share.share({ message: plain.shareText });
                    trackEvent('found_money_share_card', {
                      totalMinor: plain.totalMinor,
                      accountCount: plain.accountCount,
                    });
                    if (family) {
                      trackEvent('family_found_money_share', {
                        totalMinor: family.totalMinor,
                        referralCode: family.referralCode,
                      });
                    }
                  },
                },
                { text: 'Cancel', style: 'cancel' },
              ]);
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    } catch (e) {
      Alert.alert('Could not share', closetAlertText(e));
    }
  }

  return (
    <View>
      {deeplinkToast ? (
        <View style={styles.toast} accessibilityLiveRegion="polite">
          <Text style={styles.toastText}>{deeplinkToast}</Text>
          <Button
            label="Dismiss"
            size="sm"
            variant="ghost"
            onPress={() => setDeeplinkToast(null)}
          />
        </View>
      ) : null}

      {celebrationVariant ? (
        <View style={styles.celebrate} accessibilityRole="summary">
          <Text style={styles.bannerLabel}>{celebrationVariant.eyebrow}</Text>
          <Text style={styles.celebrateText}>{celebrationVariant.body}</Text>
          <Button label="Got it" size="sm" variant="ghost" onPress={clearJustConnected} />
        </View>
      ) : null}

      {loyaltyCelebration ? (
        <View style={styles.celebrate}>
          <Text style={styles.celebrateText}>{loyaltyCelebration}</Text>
          <Button
            label="Got it"
            size="sm"
            variant="ghost"
            onPress={clearLoyaltyJustAdded}
          />
        </View>
      ) : null}

      {flushError ? (
        <View style={styles.celebrate} accessibilityRole="alert">
          <Text style={styles.celebrateText}>
            Offline sync failed — {flushError}. We will retry when you are back online.
          </Text>
          <Button
            label="Retry sync"
            size="sm"
            variant="secondary"
            onPress={() => {
              if (!accessToken) return;
              void flushVaultAddQueue((body) => addCredit(accessToken, body)).then((snap) => {
                setPendingQueue(snap.items);
                setFlushError(snap.lastFlushError);
              });
            }}
          />
        </View>
      ) : null}

      <View style={styles.banner}>
        <Text style={styles.bannerLabel}>Found money</Text>
        <Text style={styles.bannerValue} accessibilityRole="header">
          {isLoading && !showDemo ? '…' : foundMoneyHeadline(totalMinor, preferredCurrency)}
        </Text>
        <Text style={styles.muted}>{foundMoneySubline(rawAccounts.length)}</Text>
        {currencySubtotalsLine ? (
          <Text style={styles.muted} accessibilityLabel="Balances by currency">
            {currencySubtotalsLine}
          </Text>
        ) : null}
        {totalMinor > 0 ? (
          <FoundMoneyCountUp
            totalMinor={totalMinor}
            currency={preferredCurrency}
            style={styles.bannerTotal}
          />
        ) : null}
        {tab === 'gift' && mergeSuggestions[0] ? (
          <View style={{ gap: space4 }}>
            <Text style={styles.muted}>
              Merge duplicate {mergeSuggestions[0].merchant} cards into one balance?
            </Text>
            <Button
              label={`Merge ${mergeSuggestions[0].merchant}`}
              size="sm"
              variant="secondary"
              disabled={mergeCredits.isPending}
              onPress={() => confirmMerge(mergeSuggestions[0]!)}
            />
          </View>
        ) : null}
        {tab === 'gift' && expiryHero ? (
          <ExpiryCountdownHero
            accounts={rawAccounts.map((a) => ({
              id: a.id,
              merchant: a.merchant,
              expiresAt: a.expiresAt,
              balanceCacheMinor: a.balanceCacheMinor,
              currency: a.currency,
            }))}
            highlighted={highlightExpiry}
          />
        ) : null}
        {tab === 'gift' && expiryChecklist && expiryChecklistAccount ? (
          <View style={{ gap: space4 }} testID="expiry-action-checklist">
            <Text style={styles.muted}>Before it expires</Text>
            {expiryChecklist.map((action) => (
              <Button
                key={action.id}
                label={action.label}
                size="sm"
                variant="ghost"
                onPress={() => {
                  if (action.id === 'use') {
                    openMerchantDeepLink(
                      {
                        id: expiryChecklistAccount.id,
                        merchant: expiryChecklistAccount.merchant,
                        link:
                          'link' in expiryChecklistAccount
                            ? expiryChecklistAccount.link
                            : null,
                        isDemo:
                          'isDemo' in expiryChecklistAccount &&
                          Boolean(expiryChecklistAccount.isDemo),
                        balanceCheckDue:
                          'balanceCheck' in expiryChecklistAccount
                            ? expiryChecklistAccount.balanceCheck?.due
                            : false,
                        balanceCacheMinor: expiryChecklistAccount.balanceCacheMinor,
                      },
                      'vault_use_it_now',
                    );
                    return;
                  }
                  if (action.href) {
                    Linking.openURL(action.href).catch(() =>
                      Alert.alert('Could not open reminder'),
                    );
                  }
                }}
              />
            ))}
            <Button
              label="Mark handled"
              size="sm"
              variant="secondary"
              disabled={markExpiryHandled.isPending}
              onPress={() => {
                // The sample card lives on this phone only; the API has no reminder to snooze.
                if (isSampleCreditAccount(expiryChecklistAccount)) {
                  Alert.alert('Sample card', 'Add a real card to get expiry reminders.');
                  return;
                }
                markExpiryHandled.mutate(expiryChecklistAccount.id, {
                  onSuccess: (res) => {
                    setExpiryHandledIds((prev) => new Set(prev).add(expiryChecklistAccount.id));
                    Alert.alert(
                      'Reminder snoozed',
                      `We'll nudge again around ${formatClosetDate(res.snoozedUntil)}.`,
                    );
                  },
                  onError: (e) =>
                    Alert.alert('Could not mark handled', closetAlertText(e)),
                });
              }}
            />
          </View>
        ) : null}
        {undoSpend && Date.now() <= undoSpend.until ? (
          <View style={styles.row}>
            <Text style={styles.muted}>Spend recorded</Text>
            <Button
              label="Undo"
              size="sm"
              variant="ghost"
              disabled={undoSpendGiftCard.isPending}
              onPress={undoLastSpend}
            />
          </View>
        ) : null}
        {tab === 'gift' ? (
          <MultiCardStack
            accounts={rawAccounts.map((a) => ({
              id: a.id,
              merchant: a.merchant,
              expiresAt: a.expiresAt,
              balanceCacheMinor: a.balanceCacheMinor,
              currency: a.currency,
            }))}
          />
        ) : null}
        {tab === 'gift' && rawAccounts.length > 0 ? (
          <Button
            label={soonestFocusMode ? 'Showing soonest first' : 'Soonest focus'}
            size="sm"
            variant={soonestFocusMode ? 'primary' : 'secondary'}
            onPress={() => {
              const next = !soonestFocusMode;
              setSoonestFocusMode(next);
              trackEvent('soonest_focus_toggled', { enabled: next });
            }}
          />
        ) : null}
        {tab === 'gift' ? (
          <View style={{ gap: space4 }}>
            <Text style={styles.muted}>{RECEIPT_SNAP_HERO_HINT}</Text>
            <Button
              label={RECEIPT_SNAP_HERO_LABEL}
              size="sm"
              variant="secondary"
              onPress={() => onSnapReceipt?.()}
            />
          </View>
        ) : null}
        {isDemoModeActive(demoAccount) && showDemo ? (
          <View style={{ marginTop: space4, gap: space4 }}>
            <Text style={styles.muted}>Sample mode — not real credit. Exit anytime.</Text>
            <Button
              label="Exit sample"
              size="sm"
              variant="ghost"
              onPress={() => {
                const props = demoExitedProps(useClosetStore.getState().delightStartedAt);
                trackEvent('demo_exited', props);
                exitDemoSample();
              }}
            />
          </View>
        ) : null}
        {totalMinor > 0 && tab === 'gift' ? (
          <View style={{ gap: space4 }}>
            <Button
              label={copyPack.vault.shareCta}
              size="sm"
              variant="secondary"
              onPress={() => void shareFoundMoney()}
            />
            {shareViaLabel ? <Text style={styles.muted}>{shareViaLabel}</Text> : null}
          </View>
        ) : null}
      </View>

      {rawAccounts.length > 0 ? (
        <View style={{ gap: space4, marginBottom: space4 }}>
          <TextInput
            style={styles.input}
            placeholder="Search merchant"
            placeholderTextColor={textMuted}
            value={searchInput}
            onChangeText={setSearchInput}
            accessibilityLabel="Search vault by merchant"
            autoCorrect={false}
            autoCapitalize="none"
          />
          <View style={styles.row}>
            {(
              [
                ['any', 'Any expiry'],
                ['7d', '≤7d'],
                ['30d', '≤30d'],
                ['expired', 'Expired'],
                ['none', 'No expiry'],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                label={label}
                size="sm"
                variant={expiryWindow === key ? 'primary' : 'ghost'}
                accessibilityLabel={`Filter expiry ${label}`}
                onPress={() => setExpiryWindow(key)}
              />
            ))}
          </View>
          {tab === 'gift' ? (
            <View style={styles.row}>
              {(
                [
                  ['all', 'All types'],
                  ['GIFT_CARD', 'Gift card'],
                  ['STORE_CREDIT', 'Store credit'],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  label={label}
                  size="sm"
                  variant={typeKindFilter === key ? 'primary' : 'ghost'}
                  accessibilityLabel={`Filter type ${label}`}
                  onPress={() => setTypeKindFilter(key)}
                />
              ))}
            </View>
          ) : null}
          <Button
            label={balancePositiveOnly ? 'Balance > 0' : 'Any balance'}
            size="sm"
            variant={balancePositiveOnly ? 'primary' : 'secondary'}
            accessibilityLabel="Filter balance greater than zero"
            onPress={() => setBalancePositiveOnly((v) => !v)}
          />
        </View>
      ) : null}

      {!isLoading && accounts.length === 0 && searchActive ? (
        <View style={styles.empty}>
          <Text style={styles.muted}>{vaultSearchEmptyCopy(true)}</Text>
        </View>
      ) : null}

      {!isLoading && accounts.length === 0 && !searchActive ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {tab === 'gift'
              ? vaultEmpty.title
              : loyaltyEmpty
                ? loyaltyEmpty.title
                : meta.emptyTitle}
          </Text>
          <Text style={styles.muted}>
            {tab === 'gift'
              ? vaultEmpty.message
              : loyaltyEmpty
                ? loyaltyEmpty.body
                : meta.emptyBody}
          </Text>
          <Button
            label={
              tab === 'gift'
                ? (vaultEmpty.primaryCta ?? meta.addLabel)
                : loyaltyEmpty
                  ? loyaltyEmpty.cta
                  : meta.addLabel
            }
            block
            onPress={() => {
              trackEvent(
                'empty_cta_tap',
                emptyCtaTapProps('vault', emptyCopyVariant, 'primary'),
              );
              setAdding(true);
            }}
          />
          {tab === 'gift' ? (
            <Button
              label={vaultEmpty.demoCta ?? SAMPLE_MYNTRA_CREDIT.label}
              block
              variant="secondary"
              onPress={() => {
                trackEvent(
                  'empty_cta_tap',
                  emptyCtaTapProps('vault', emptyCopyVariant, 'demo'),
                );
                trySample();
              }}
            />
          ) : null}
          {isError && tab === 'gift' ? (
            <Text style={styles.muted}>
              Couldn’t load vault credits yet — try a sample card or add one manually.
            </Text>
          ) : null}
        </View>
      ) : (
        <Button
          label={
            adding
              ? 'Cancel'
              : accounts.length >= 1 && tab === 'gift'
                ? 'Add another'
                : meta.addLabel
          }
          variant={adding ? 'secondary' : 'primary'}
          block
          onPress={() => {
            if (!adding && accounts.length >= 1 && tab === 'gift') {
              trackEvent('add_another_tap');
            }
            setAdding((v) => !v);
          }}
        />
      )}

      {adding ? (
        <View style={styles.form}>
          {tab === 'gift' ? (
            <View style={styles.row}>
              <Button
                label={captureGiftCard.isPending ? 'Scanning…' : 'Scan barcode'}
                size="sm"
                variant="secondary"
                disabled={captureGiftCard.isPending}
                onPress={() => {
                  setAdding(true);
                  scanBarcodeViaApi();
                }}
              />
              <Button
                label={captureGiftCard.isPending ? 'Reading…' : 'Photo of card'}
                size="sm"
                variant="secondary"
                disabled={captureGiftCard.isPending}
                onPress={() => void photoCaptureCard()}
              />
            </View>
          ) : null}
          {tab === 'gift' ? (
            <TextInput
              style={styles.input}
              placeholder="Barcode number (optional)"
              placeholderTextColor={textMuted}
              value={barcodeRaw}
              onChangeText={(v) => {
                setBarcodeRaw(v);
                if (v.trim().length >= 4) applyBarcodeParse(v);
              }}
              autoCapitalize="characters"
            />
          ) : null}
          <TextInput
            style={styles.input}
            placeholder="Merchant (e.g. Amazon)"
            placeholderTextColor={textMuted}
            value={merchant}
            onChangeText={setMerchant}
          />
          {tab === 'gift' ? (
            <>
              <TextInput
                style={styles.input}
                placeholder="Card code (optional)"
                placeholderTextColor={textMuted}
                value={cardCode}
                onChangeText={setCardCode}
                autoCapitalize="characters"
              />
              <TextInput
                style={styles.input}
                placeholder="Last 4 (optional)"
                placeholderTextColor={textMuted}
                value={last4}
                onChangeText={setLast4}
                maxLength={8}
              />
              {capture ? (
                <Text style={styles.muted}>
                  From {capture.source === 'BARCODE' ? 'the barcode' : 'the photo'}
                  {capture.last4 ? ` · ···${capture.last4}` : ''}
                </Text>
              ) : null}
            </>
          ) : null}
          <TextInput
            style={styles.input}
            placeholder={tab === 'loyalty' ? `Points / value (${preferredCurrency})` : `Balance (${preferredCurrency})`}
            placeholderTextColor={textMuted}
            keyboardType="decimal-pad"
            value={balance}
            onChangeText={setBalance}
          />
          <TextInput
            style={styles.input}
            placeholder="Expiry (YYYY-MM-DD, optional)"
            placeholderTextColor={textMuted}
            value={expiry}
            onChangeText={setExpiry}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            accessibilityLabel="Expiry date"
          />
          <Button
            label={`Save ${meta.noun}`}
            block
            disabled={addGiftCard.isPending}
            onPress={() => submitAdd()}
          />
        </View>
      ) : null}

      <View style={styles.list}>
        {isLoading && !showDemo ? <Text style={styles.muted}>Loading…</Text> : null}
        <ClosetVirtualList
          data={accounts}
          keyExtractor={(account) => account.id}
          renderItem={({ item: account }) => (
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.merchant}>
                {isSampleCreditAccount(account)
                  ? demoAccountDisplayName(account.merchant)
                  : 'pendingSync' in account && account.pendingSync
                    ? `${account.merchant} (pending sync)`
                    : account.merchant}
              </Text>
              {isSampleCreditAccount(account) ? (
                <Text style={[styles.badge, styles.badgeSoon]} accessibilityLabel="Sample card">
                  {DEMO_BADGE_LABEL}
                </Text>
              ) : null}
              <ExpiryBadge expiresAt={account.expiresAt} />
            </View>
            <Text style={styles.balance}>
              {formatMinor(account.balanceCacheMinor, account.currency)}
            </Text>
            {account.expiresAt ? (
              <Text style={styles.expiry}>
                Expires {formatClosetDate(account.expiresAt)}
              </Text>
            ) : null}

            {spendingId === account.id ? (
              <View style={styles.form}>
                <TextInput
                  style={styles.input}
                  placeholder={`Amount spent in ${account.currency}`}
                  placeholderTextColor={textMuted}
                  keyboardType="decimal-pad"
                  value={spendAmount}
                  onChangeText={setSpendAmount}
                />
                <View style={styles.row}>
                  <Button
                    label="Confirm"
                    size="sm"
                    onPress={() => submitSpend(account.id)}
                  />
                  <Button
                    label="Cancel"
                    size="sm"
                    variant="ghost"
                    onPress={() => {
                      setSpendingId(null);
                      setSpendAmount('');
                    }}
                  />
                </View>
              </View>
            ) : recheckingId === account.id ? (
              <View style={styles.form}>
                <TextInput
                  style={styles.input}
                  placeholder={`Current balance in ${account.currency}`}
                  placeholderTextColor={textMuted}
                  keyboardType="decimal-pad"
                  value={recheckAmount}
                  onChangeText={setRecheckAmount}
                />
                <View style={styles.row}>
                  <Button
                    label="Save balance"
                    size="sm"
                    onPress={() => submitRecheck(account.id)}
                  />
                  <Button
                    label="Cancel"
                    size="sm"
                    variant="ghost"
                    onPress={() => {
                      setRecheckingId(null);
                      setRecheckAmount('');
                    }}
                  />
                </View>
              </View>
            ) : (
              <View style={{ gap: space4 }}>
                {'balanceCheck' in account &&
                shouldShowBalanceRecheckNudge(account.balanceCheck?.due) ? (
                  <View style={styles.recheckNudge}>
                    <Text style={styles.recheckTitle}>
                      {balanceRecheckNudgeCopy(account.merchant).title}
                    </Text>
                    <Text style={styles.muted}>
                      {balanceRecheckNudgeCopy(account.merchant).body}
                    </Text>
                    <View style={styles.row}>
                      <Button
                        label={balanceRecheckNudgeCopy(account.merchant).recheckCta}
                        size="sm"
                        onPress={() => runBalanceCheck(account.id, account.merchant)}
                      />
                      <Button
                        label={balanceRecheckNudgeCopy(account.merchant).remindCta}
                        size="sm"
                        variant="secondary"
                        onPress={() =>
                          scheduleBalanceReminder({
                            id: account.id,
                            merchant: account.merchant,
                            link: 'link' in account ? account.link : null,
                            balanceCheck:
                              'balanceCheck' in account ? account.balanceCheck : undefined,
                          })
                        }
                      />
                    </View>
                  </View>
                ) : null}
                <View style={styles.row}>
                  <Button
                    label={tab === 'loyalty' ? 'Use points' : 'Use it now'}
                    size="sm"
                    variant="secondary"
                    onPress={() =>
                      openMerchantDeepLink(
                        {
                          id: account.id,
                          merchant: account.merchant,
                          link: 'link' in account ? account.link : null,
                          isDemo: 'isDemo' in account && account.isDemo,
                          balanceCheckDue:
                            'balanceCheck' in account
                              ? account.balanceCheck?.due
                              : false,
                          balanceCacheMinor: account.balanceCacheMinor,
                        },
                        'vault_use_it_now',
                      )
                    }
                  />
                  {shouldShowWeekendChip(account) ? (
                    <Button
                      label={USE_THIS_WEEKEND_LABEL}
                      size="sm"
                      variant="ghost"
                      onPress={() =>
                        planWeekend({
                          id: account.id,
                          merchant: account.merchant,
                          link: 'link' in account ? account.link : null,
                          isDemo: 'isDemo' in account && account.isDemo,
                        })
                      }
                    />
                  ) : null}
                  <Button
                    label={
                      'balanceCheck' in account && account.balanceCheck?.due
                        ? 'Re-check due'
                        : 'Re-check'
                    }
                    size="sm"
                    variant="ghost"
                    disabled={balanceCheck.isPending}
                    onPress={() => runBalanceCheck(account.id, account.merchant)}
                  />
                  <Button
                    label="Mark spent"
                    size="sm"
                    variant="ghost"
                    onPress={() => setSpendingId(account.id)}
                  />
                </View>
              </View>
            )}
          </View>
          )}
        />
      </View>
    </View>
  );
}

function ReceiptsTab({
  autoSnap = false,
  onAutoSnapHandled,
  initialSearch = null,
}: {
  autoSnap?: boolean;
  onAutoSnapHandled?: () => void;
  /** W041 — prefill merchant/date from return → GST jump. */
  initialSearch?: GstInvoiceSearchPrefill | null;
} = {}) {
  const [searchMerchant, setSearchMerchant] = useState(initialSearch?.merchant ?? '');
  const [searchGstin, setSearchGstin] = useState('');
  const [searchFrom, setSearchFrom] = useState(initialSearch?.from ?? '');
  const [searchTo, setSearchTo] = useState(initialSearch?.to ?? '');
  const [applied, setApplied] = useState<{
    merchant?: string;
    from?: string;
    to?: string;
    gstin?: string;
  }>(() =>
    initialSearch
      ? {
          merchant: initialSearch.merchant,
          from: initialSearch.from,
          to: initialSearch.to,
        }
      : {},
  );

  useEffect(() => {
    if (!initialSearch) return;
    setSearchMerchant(initialSearch.merchant ?? '');
    setSearchFrom(initialSearch.from ?? '');
    setSearchTo(initialSearch.to ?? '');
    setApplied({
      merchant: initialSearch.merchant,
      from: initialSearch.from,
      to: initialSearch.to,
    });
  }, [initialSearch?.merchant, initialSearch?.from, initialSearch?.to]);

  const { data, isLoading } = useReceipts(applied);
  const upload = useUploadReceipt();
  const confirm = useConfirmReceipt();
  const exportReceipt = useExportReceipt();

  const [pending, setPending] = useState<ReceiptParsed | null>(null);
  const [merchant, setMerchant] = useState('');
  const [purchasedAt, setPurchasedAt] = useState('');
  const [totalRupees, setTotalRupees] = useState('');
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [overrideLowConfidence, setOverrideLowConfidence] = useState(false);

  function applyParsed(parsed: ReceiptParsed) {
    setPending(parsed);
    setMerchant(parsed.merchant);
    // The purchase day on this phone; slicing the ISO string gave the UTC day.
    const purchaseDay = localDayKey(new Date(parsed.purchasedAt));
    const unit = 10 ** fractionDigits(parsed.currency);
    setPurchasedAt(purchaseDay);
    setTotalRupees(String(parsed.totalMinor / unit));
    setOverrideLowConfidence(false);
    const hint = parsed.warrantyHint;
    const claimHint = parsed.claimContactHint ?? '';
    setEditItems(
      parsed.items.map((i, idx) => {
        const inferred =
          inferWarrantyCategory(i.title, i.category) ??
          (i.category as WarrantyCategory | undefined);
        const preset =
          inferred && WARRANTY_COVERAGE_PRESETS[inferred]
            ? WARRANTY_COVERAGE_PRESETS[inferred]
            : null;
        const autoWarranty =
          hint?.itemIndex === idx || Boolean(preset);
        const months = hint?.itemIndex === idx ? hint.months : preset?.months;
        // Real calendar months: 12 x 30 days ended a one-year warranty 5 days early.
        const coverageUntil =
          autoWarranty && months ? (addMonthsToDayKey(purchaseDay, months) ?? '') : '';
        return {
          title: i.title,
          priceMinor: i.priceMinor,
          priceText: String(i.priceMinor / unit),
          warranty: autoWarranty,
          coverageUntil,
          claimContact: autoWarranty ? claimHint : '',
          category: inferred ?? null,
        };
      }),
    );
  }

  async function snap() {
    const picked = await pickReceiptSnapImage(ImagePicker);
    if (!picked) return;
    upload.mutate(picked.uri, {
      onSuccess: (parsed) => applyParsed(parsed),
      onError: (e) => Alert.alert('Could not read receipt', closetAlertText(e)),
    });
  }

  useEffect(() => {
    if (!autoSnap) return;
    onAutoSnapHandled?.();
    void snap();
    // Fire once per request.
  }, [autoSnap]);

  function updateItem(idx: number, patch: Partial<EditItem>) {
    setEditItems((items) => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  /** The body to save, or what the user has to fix first. Bad dates used to throw out of the handler. */
  function buildConfirmBody(override: boolean): ConfirmReceiptBody | string | null {
    if (!pending) return null;
    const currency = pending.currency;
    const items: ConfirmReceiptBody['items'] = [];
    for (const i of editItems) {
      const t = i.priceText.trim();
      const priceMinor = /^0+([.,]0*)?$/.test(t) ? 0 : parseAmountInput(t, currency);
      if (priceMinor === null) {
        return `Check the price of ${i.title.trim() || 'each item'}.`;
      }
      items.push({ title: i.title.trim() || 'Item', priceMinor });
    }
    const warranties: NonNullable<ConfirmReceiptBody['warranties']> = [];
    for (const [idx, i] of editItems.entries()) {
      if (!i.warranty) continue;
      const coverageUntil = endOfDayKeyIso(i.coverageUntil);
      if (!coverageUntil) {
        return `Enter the warranty end for ${i.title.trim() || 'each item'} as YYYY-MM-DD.`;
      }
      warranties.push({
        itemIndex: idx,
        coverageUntil,
        claimContact: i.claimContact || undefined,
        category: i.category ?? undefined,
      });
    }

    // Blank total means "the items added up"; anything typed must be a real amount.
    const typedTotal = totalRupees.trim() ? parseAmountInput(totalRupees, currency) : undefined;
    if (typedTotal === null) return 'Check the total.';
    const totalMinor = typedTotal ?? items.reduce((sum, i) => sum + i.priceMinor, 0);
    const day = purchasedAt.trim() ? parseDayKey(purchasedAt) : undefined;
    if (day === null) return 'Enter the purchase date as YYYY-MM-DD.';
    // Noon UTC is the same calendar day from UTC-11 to UTC+11, so the day key survives the round trip.
    const dateIso = day ? new Date(`${day}T12:00:00.000Z`).toISOString() : pending.purchasedAt;

    return {
      merchant: merchant.trim() || pending.merchant,
      purchasedAt: dateIso,
      totalMinor,
      currency: pending.currency,
      items,
      // Always send array so empty = user opted out of category-rule auto (U010).
      warranties,
      ...(override ? { overrideLowConfidence: true } : {}),
    };
  }

  function submitConfirm(forceOverride = false) {
    if (!pending) return;
    const needsOverride = requiresConfirmOverride(pending.confidence);
    if (needsOverride && !forceOverride && !overrideLowConfidence) {
      Alert.alert(
        'Low OCR confidence',
        'This scan looks uncertain. Review the fields, then confirm anyway only if they look right.',
        [
          { text: 'Keep editing', style: 'cancel' },
          {
            text: 'Confirm anyway',
            style: 'destructive',
            onPress: () => {
              setOverrideLowConfidence(true);
              submitConfirm(true);
            },
          },
        ],
      );
      return;
    }

    const body = buildConfirmBody(needsOverride || forceOverride || overrideLowConfidence);
    if (!body) return;
    if (typeof body === 'string') {
      Alert.alert('Check the receipt', body);
      return;
    }
    confirm.mutate(
      { id: pending.id, body },
      {
        onSuccess: () => {
          setPending(null);
          setEditItems([]);
          setOverrideLowConfidence(false);
        },
        onError: (e) => Alert.alert('Could not save receipt', closetAlertText(e)),
      },
    );
  }

  const receipts = data?.receipts ?? [];

  if (pending) {
    return (
      <View style={styles.list}>
        <View style={styles.cardRow}>
          <Text style={styles.sectionTitle}>Review receipt</Text>
          <ConfidenceBadge confidence={pending.confidence} />
        </View>
        {requiresConfirmOverride(pending.confidence) ? (
          <Text style={styles.muted}>
            Confidence is below the confirm threshold. Edit fields carefully, or override to save.
          </Text>
        ) : null}
        <TextInput
          style={styles.input}
          placeholder="Merchant"
          placeholderTextColor={textMuted}
          value={merchant}
          onChangeText={setMerchant}
        />
        <TextInput
          style={styles.input}
          placeholder="Purchased on (YYYY-MM-DD)"
          placeholderTextColor={textMuted}
          value={purchasedAt}
          onChangeText={setPurchasedAt}
        />
        <TextInput
          style={styles.input}
          placeholder={`Total in ${pending.currency}`}
          placeholderTextColor={textMuted}
          keyboardType="decimal-pad"
          value={totalRupees}
          onChangeText={setTotalRupees}
        />
        {editItems.map((item, idx) => (
          <View key={idx} style={styles.card}>
            <TextInput
              style={styles.input}
              placeholder="Item"
              placeholderTextColor={textMuted}
              value={item.title}
              onChangeText={(v) => updateItem(idx, { title: v })}
            />
            <TextInput
              style={styles.input}
              placeholder={`Price in ${pending.currency}`}
              placeholderTextColor={textMuted}
              keyboardType="decimal-pad"
              value={item.priceText}
              onChangeText={(v) => updateItem(idx, { priceText: v })}
            />
            <Button
              label={item.warranty ? 'Warranty on' : 'Add warranty'}
              size="sm"
              variant={item.warranty ? 'primary' : 'secondary'}
              onPress={() => updateItem(idx, { warranty: !item.warranty })}
            />
            {item.warranty ? (
              <View style={styles.form}>
                <TextInput
                  style={styles.input}
                  placeholder="Coverage until (YYYY-MM-DD)"
                  placeholderTextColor={textMuted}
                  value={item.coverageUntil}
                  onChangeText={(v) => updateItem(idx, { coverageUntil: v })}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Claim contact (optional)"
                  placeholderTextColor={textMuted}
                  value={item.claimContact}
                  onChangeText={(v) => updateItem(idx, { claimContact: v })}
                />
              </View>
            ) : null}
          </View>
        ))}
        <Button label="Save receipt" block disabled={confirm.isPending} onPress={() => submitConfirm()} />
        <Button label="Cancel" variant="ghost" onPress={() => setPending(null)} />
      </View>
    );
  }

  return (
    <View>
      <Button
        label={upload.isPending ? 'Reading…' : 'Snap a receipt'}
        block
        disabled={upload.isPending}
        onPress={snap}
      />
      <View style={styles.form}>
        <Text style={styles.sectionTitle}>Search invoices</Text>
        <TextInput
          style={styles.input}
          placeholder="Merchant"
          placeholderTextColor={textMuted}
          value={searchMerchant}
          onChangeText={setSearchMerchant}
        />
        <TextInput
          style={styles.input}
          placeholder="GSTIN"
          placeholderTextColor={textMuted}
          autoCapitalize="characters"
          value={searchGstin}
          onChangeText={setSearchGstin}
        />
        <TextInput
          style={styles.input}
          placeholder="From (YYYY-MM-DD)"
          placeholderTextColor={textMuted}
          value={searchFrom}
          onChangeText={setSearchFrom}
        />
        <TextInput
          style={styles.input}
          placeholder="To (YYYY-MM-DD)"
          placeholderTextColor={textMuted}
          value={searchTo}
          onChangeText={setSearchTo}
        />
        <Button
          label="Search"
          size="sm"
          onPress={() => {
            const from = searchFrom.trim() ? parseDayKey(searchFrom) : undefined;
            const to = searchTo.trim() ? parseDayKey(searchTo) : undefined;
            if (from === null || to === null) {
              Alert.alert('Check the dates', 'Enter them as YYYY-MM-DD, for example 2026-10-01.');
              return;
            }
            setApplied({
              merchant: searchMerchant.trim() || undefined,
              gstin: searchGstin.trim() || undefined,
              from,
              to,
            });
          }}
        />
      </View>
      <View style={styles.list}>
        {isLoading ? <Text style={styles.muted}>Loading…</Text> : null}
        <ClosetVirtualList
          data={receipts}
          keyExtractor={(r) => r.id}
          ListEmptyComponent={
            !isLoading ? (
              <Text style={styles.muted}>{emptyStateCopy('receipts').message}</Text>
            ) : null
          }
          renderItem={({ item: r }) => (
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.merchant}>{r.merchant}</Text>
              <ConfidenceBadge confidence={r.confidence} />
            </View>
            <Text style={styles.balance}>
              {formatMinor(r.totalMinor, r.currency)}
            </Text>
            <Text style={styles.expiry}>
              {formatClosetDate(r.purchasedAt)}
              {r.gstin ? ` · ${r.gstin}` : ''}
            </Text>
            <View style={styles.rowActions}>
              <Button
                label="Export image"
                size="sm"
                variant="secondary"
                disabled={exportReceipt.isPending}
                onPress={() => {
                  exportReceipt.mutate(
                    { id: r.id, format: 'image' },
                    {
                      onSuccess: (res) => {
                        Linking.openURL(res.downloadUrl).catch(() =>
                          Alert.alert('Export ready', res.filename),
                        );
                      },
                      onError: (e) => Alert.alert('Export failed', closetAlertText(e)),
                    },
                  );
                }}
              />
              <Button
                label="Export PDF"
                size="sm"
                variant="ghost"
                disabled={exportReceipt.isPending}
                onPress={() => {
                  exportReceipt.mutate(
                    { id: r.id, format: 'pdf' },
                    {
                      onSuccess: async (res) => {
                        try {
                          await shareDataUrlFile({
                            fileName: res.filename,
                            dataUrl: res.downloadUrl,
                            dialogTitle: 'Share invoice',
                          });
                        } catch (e) {
                          Alert.alert('Could not share the PDF', closetAlertText(e));
                        }
                      },
                      onError: (e) => Alert.alert('Export failed', closetAlertText(e)),
                    },
                  );
                }}
              />
            </View>
          </View>
          )}
        />
      </View>
    </View>
  );
}

function WarrantiesTab() {
  const { data, isLoading } = useWarranties();
  const claim = useClaimWarranty();
  const unclaim = useUnclaimWarranty();
  const snooze = useSnoozeWarranty();
  const warranties = data?.warranties ?? [];
  const [justClaimedId, setJustClaimedId] = useState<string | null>(null);

  return (
    <View style={styles.list}>
      {isLoading ? <Text style={styles.muted}>Loading…</Text> : null}
      {!isLoading && warranties.length === 0 ? (
        <Text style={styles.muted}>No warranties yet. Add one from a receipt.</Text>
      ) : null}
      {warranties.map((w) => (
        <View key={w.id} style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.merchant}>{w.itemTitle}</Text>
            <WarrantyBadge coverageUntil={w.coverageUntil} state={w.state} />
          </View>
          <Text style={styles.balance}>{w.provider}</Text>
          {w.category ? (
            <Text style={styles.expiry}>
              {WARRANTY_COVERAGE_PRESETS[w.category as WarrantyCategory]?.label ??
                w.category}{' '}
              coverage
            </Text>
          ) : null}
          <Text style={styles.expiry}>
            Covers until {formatClosetDate(w.coverageUntil)}
          </Text>
          {w.claimContact ? (
            <Text style={styles.expiry}>Claim: {w.claimContact}</Text>
          ) : null}
          {w.state === 'CLAIMED' || justClaimedId === w.id ? (
            <View style={styles.row}>
              <Text style={styles.muted}>Claim started</Text>
              <Button
                label="Undo"
                size="sm"
                variant="ghost"
                disabled={unclaim.isPending}
                onPress={() =>
                  unclaim.mutate(w.id, {
                    onSuccess: () => setJustClaimedId(null),
                    onError: (e) => Alert.alert('Could not undo', closetAlertText(e)),
                  })
                }
              />
              <Button
                label="Snooze 3d"
                size="sm"
                variant="ghost"
                disabled={snooze.isPending}
                onPress={() =>
                  snooze.mutate(
                    { id: w.id, days: 3 },
                    {
                      onSuccess: (res) =>
                        Alert.alert(
                          'Reminder snoozed',
                          `We'll nudge again around ${formatClosetDate(res.snoozedUntil)}.`,
                        ),
                      onError: (e) =>
                        Alert.alert('Could not snooze', closetAlertText(e)),
                    },
                  )
                }
              />
            </View>
          ) : null}
          {w.state === 'ACTIVE' ? (
            <View style={styles.row}>
              <Button
                label="Claim"
                size="sm"
                variant="secondary"
                disabled={claim.isPending}
                onPress={() =>
                  claim.mutate(w.id, {
                    onSuccess: async (res) => {
                      setJustClaimedId(w.id);
                      try {
                        await shareTextFile({
                          fileName: `warranty-claim-${w.id.slice(0, 8)}.txt`,
                          contents: res.packet.shareText,
                          mimeType: 'text/plain',
                          dialogTitle: 'Share claim packet',
                        });
                      } catch {
                        await Share.share({
                          message: res.packet.shareText,
                          title: res.packet.subject,
                        }).catch(() => undefined);
                      }
                      if (res.claimUrl) {
                        Linking.openURL(res.claimUrl).catch(() => {
                          Alert.alert(
                            'Claim started',
                            'Claim packet ready — open your email or merchant portal to finish. Undo within 24h.',
                          );
                        });
                      } else {
                        Alert.alert(
                          'Claim started',
                          'Warranty marked claimed. Share the packet, then undo within 24h if needed.',
                        );
                      }
                    },
                    onError: (e) => Alert.alert('Could not claim', closetAlertText(e)),
                  })
                }
              />
              <Button
                label="Snooze 3d"
                size="sm"
                variant="ghost"
                disabled={snooze.isPending}
                onPress={() =>
                  snooze.mutate(
                    { id: w.id, days: 3 },
                    {
                      onSuccess: (res) =>
                        Alert.alert(
                          'Reminder snoozed',
                          `We'll nudge again around ${formatClosetDate(res.snoozedUntil)}.`,
                        ),
                      onError: (e) =>
                        Alert.alert('Could not snooze', closetAlertText(e)),
                    },
                  )
                }
              />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radiusMd,
    fontFamily: fontSans,
    fontSize: fsCaption,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeExpired: {
    backgroundColor: '#fde2e1',
    color: '#b3261e',
  },
  badgeSoon: {
    backgroundColor: '#fff1d6',
    color: '#9a6700',
  },
  badgeOk: {
    backgroundColor: '#e3f4e1',
    color: '#1e7a32',
  },
  badgeClaimed: {
    backgroundColor: '#eaeaf0',
    color: '#5a5a66',
  },
  banner: {
    backgroundColor: closet.accentBg,
    borderColor: closet.accentSoft,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: space4,
    marginBottom: space4,
    padding: space4,
  },
  bannerLabel: {
    color: closet.found,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  bannerTotal: {
    color: closet.found,
    fontFamily: fontSans,
    fontSize: 36,
    fontWeight: '700',
    marginTop: space4,
  },
  bannerValue: {
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '700',
    lineHeight: 26,
    marginTop: 6,
  },
  celebrate: {
    backgroundColor: closet.accentBg,
    borderColor: closet.accent,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: space4,
    marginBottom: space4,
    padding: space4,
  },
  celebrateText: {
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsBody,
    lineHeight: 22,
  },
  card: {
    backgroundColor: closet.surface,
    borderColor: closet.rule,
    borderRadius: radiusMd,
    borderWidth: 1,
    marginBottom: space4,
    padding: space4,
  },
  cardRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  balance: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '600',
    marginTop: 4,
  },
  empty: {
    backgroundColor: closet.surface,
    borderColor: closet.rule,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: space4,
    marginBottom: space4,
    padding: space4,
  },
  emptyTitle: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '700',
  },
  expiry: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    marginTop: 2,
  },
  form: {
    gap: space4,
    marginTop: space4,
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space4,
    marginTop: space4,
  },
  input: {
    backgroundColor: closet.bg,
    borderColor: closet.rule,
    borderRadius: radiusMd,
    borderWidth: 1,
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  list: {
    marginTop: space6,
  },
  merchant: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '600',
    flexShrink: 1,
    paddingRight: 8,
  },
  muted: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    gap: space4,
  },
  sectionTitle: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '700',
    marginBottom: space4,
  },
  tabs: {
    flexDirection: 'row',
    gap: space4,
    marginBottom: space4,
    flexWrap: 'wrap',
  },
  connectCta: {
    backgroundColor: closet.surface,
    borderColor: closet.rule,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: space4,
    marginBottom: space6,
    padding: space4,
  },
  connectTitle: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '700',
  },
  urgency: {
    backgroundColor: '#fff8eb',
    borderColor: '#e8c98a',
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: space4,
    marginBottom: space4,
    padding: space4,
  },
  urgencyText: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    lineHeight: 22,
  },
  toast: {
    backgroundColor: closet.accentBg,
    borderColor: closet.accentSoft,
    borderRadius: radiusMd,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space4,
    marginBottom: space4,
    padding: space4,
  },
  toastText: {
    color: closet.ink,
    flex: 1,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
  },
  recheckNudge: {
    backgroundColor: '#fff8eb',
    borderColor: '#e8c98a',
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: space4,
    padding: space4,
  },
  recheckTitle: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '700',
  },
});

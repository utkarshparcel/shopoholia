import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatMinor, merchantReturnUrl, sizeMapTipForBrand, REFUND_DESTINATION_LABELS, buildPortalFieldChecklist, needsRefundChase, REFUND_CHASE_STEPS, SIZE_RETURN_REASONS, type RefundDestination } from '@worn/shared';
import { useRouter } from 'expo-router';

import { Button } from '@/src/components/ui';
import {
  useAccountantLedger,
  useBookReturnPickup,
  useCancelReturnPickup,
  useConfirmReturn,
  useCorrectReturnWindow,
  useEscalateRefundChase,
  useInitiateReturn,
  useMarkReturnRefunded,
  usePurchases,
  useRefundEtaBoard,
  useRescheduleReturnPickup,
  useReturnDetail,
  useReturns,
  useSizeMap,
  useSnoozeRefundChase,
} from '@/src/hooks/closet/useCloset';
import { createReturnPoll } from '@/src/api/client';
import { parseAmountInput } from '@/src/lib/amountInput';
import { useClosetPrefsStore } from '@/src/lib/closetPrefs';
import { delightHapticRefundLanded } from '@/src/lib/delightHaptics';
import { formatClosetDate, formatClosetDateTime } from '@/src/lib/format';
import { gstInvoiceHrefFromReturn } from '@/src/lib/gstFromReturn';
import { endOfDayKeyIso } from '@/src/lib/localDay';
import { returnCountdown } from '@/src/lib/returnCountdown';
import {
  markRefundedCelebration,
  nudgePickupSlotHours,
  partitionReturnsByDeadline,
  refundEtaLiveLabel,
  returnPortalOpenProps,
  suggestPickupSlots,
} from '@/src/lib/returnsPolish';
import { returnStatusTimeline } from '@/src/lib/returnTimeline';
import { returnPollItemLabel } from '@/src/lib/socialPolls';
import { trackEvent } from '@/src/lib/analytics';
import { closetAlertText } from '@/src/lib/closetScreenState';
import { ProgressivePermPrompt } from '@/src/components/ProgressivePermPrompt';
import { useClosetStore } from '@/src/stores/closet';
import { useSessionStore } from '@/src/stores/session';
import {
  bg,
  border,
  closet,
  fontSans,
  fontSansSemiBold,
  fontSansMedium,
  fsBody,
  fsCaption,
  radiusMd,
  space3,
  space4,
  space6,
  surface,
  text,
  textMuted,
} from '@/src/theme/tokens';

/** Tick so countdown labels stay live without remounting. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const RETURN_STATE_LABEL: Record<string, string> = {
  REQUESTED: 'Requested',
  INITIATED: 'Started',
  PICKUP_SCHEDULED: 'Pickup booked',
  CONFIRMED: 'Sent back',
  REFUNDED: 'Refunded',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
};

/** "Pickup booked" for PICKUP_SCHEDULED; an unknown state reads in lower case, never as an enum. */
export function returnStateLabel(state: string | null | undefined): string {
  if (!state) return '—';
  return RETURN_STATE_LABEL[state] ?? state.replace(/_/g, ' ').toLowerCase();
}

type ReturnsPanelProps = {
  /** When true, show recent REFUND ledger rows under the list (Vault). */
  showLedgerRefunds?: boolean;
};

/**
 * Single source of truth for Closet returns UI — used by `/(closet)/returns`
 * and the Vault Returns tab.
 */
export function ReturnsPanel({ showLedgerRefunds = false }: ReturnsPanelProps) {
  const { data, isLoading } = useReturns();
  const returns = data?.returns ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const [expiredOpen, setExpiredOpen] = useState(false);
  const [celebration, setCelebration] = useState<string | null>(null);
  const now = useNow();
  const currency = useClosetPrefsStore((s) => s.preferredCurrency);
  const { data: ledger } = useAccountantLedger();
  const { data: etaBoard, isLoading: etaLoading } = useRefundEtaBoard({ all: true });
  const boardRows = etaBoard?.board ?? [];

  const { open: openReturns, expired: expiredReturns } = useMemo(
    () => partitionReturnsByDeadline(returns, now),
    [returns, now],
  );

  const refundEntries = (ledger?.entries ?? []).filter(
    (e) => e.kind === 'LEDGER' && e.description.toUpperCase().startsWith('REFUND'),
  );

  if (selected) {
    return (
      <ReturnDetail
        id={selected}
        onBack={() => setSelected(null)}
        now={now}
        onRefundCelebrated={(body) => {
          setCelebration(body);
          setSelected(null);
        }}
      />
    );
  }

  return (
    <View>
      <ProgressivePermPrompt />

      {celebration ? (
        <View style={styles.celebrate} testID="refund-celebrate-banner">
          <Text style={styles.celebrateTitle}>Refund landed</Text>
          <Text style={styles.celebrateBody}>{celebration}</Text>
          <Button label="Dismiss" size="sm" variant="ghost" onPress={() => setCelebration(null)} />
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Refund ETA</Text>
      <Text style={styles.boardHint}>
        Each refund from started to sent back to refunded, until the money lands in your ledger.
      </Text>
      {etaLoading ? <Text style={styles.muted}>Loading board…</Text> : null}
      {!etaLoading && boardRows.length === 0 ? (
        <Text style={styles.muted}>No active refunds. Initiate a return to start the board.</Text>
      ) : null}
      {boardRows.map((row) => {
        const title =
          row.itemTitle?.trim() || row.merchant?.trim() || 'Return';
        const liveEta = refundEtaLiveLabel(row.etaAt, row.ledgerCredited, now);
        return (
          <View key={row.returnId} style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.merchant}>{title}</Text>
              <Text
                style={[
                  styles.badge,
                  row.ledgerCredited ? styles.badgeOk : styles.badgeSoon,
                ]}
              >
                {row.ledgerCredited ? 'In ledger' : returnStateLabel(row.state)}
              </Text>
            </View>
            <Text style={styles.pipelineLine}>
              {row.pipeline.map((s) => s.label).join(' → ')}
            </Text>
            {row.ledgerCredited ? (
              <Text style={styles.refundLanded} testID={`eta-landed-${row.returnId}`}>
                {liveEta}
                {row.ledgerAmountMinor != null ? ` · ${formatMinor(row.ledgerAmountMinor, currency)}` : ''}
              </Text>
            ) : (
              <Text style={styles.expiry} testID={`eta-live-${row.returnId}`}>
                {liveEta}
                {row.etaAt ? ` · ${formatClosetDate(row.etaAt)}` : ''}
              </Text>
            )}
            <Button
              label="View"
              size="sm"
              variant="secondary"
              onPress={() => setSelected(row.returnId)}
            />
          </View>
        );
      })}

      <Text style={styles.sectionTitle}>All returns</Text>
      <View style={styles.list}>
        {isLoading ? <Text style={styles.muted}>Loading…</Text> : null}
        {!isLoading && returns.length === 0 ? (
          <Text style={styles.muted}>No returns yet. Initiate one from a purchase.</Text>
        ) : null}
        {openReturns.map((r) => (
          <ReturnListCard key={r.id} r={r} now={now} onView={() => setSelected(r.id)} />
        ))}
        {expiredReturns.length > 0 ? (
          <View style={styles.expiredWrap} testID="expired-returns-section">
            <Button
              label={
                expiredOpen
                  ? `Hide expired (${expiredReturns.length})`
                  : `Expired (${expiredReturns.length})`
              }
              size="sm"
              variant="ghost"
              onPress={() => setExpiredOpen((v) => !v)}
            />
            {expiredOpen
              ? expiredReturns.map((r) => (
                  <ReturnListCard key={r.id} r={r} now={now} onView={() => setSelected(r.id)} />
                ))
              : null}
          </View>
        ) : null}
      </View>

      {showLedgerRefunds ? (
        <View>
          <Text style={styles.sectionTitle}>Refund ledger</Text>
          {refundEntries.length === 0 ? (
            <Text style={styles.muted}>
              When you mark a return refunded, the refund shows here.
            </Text>
          ) : (
            refundEntries.slice(0, 8).map((e) => (
              <View key={e.id} style={styles.card} testID={`ledger-refund-${e.id}`}>
                <Text style={styles.merchant}>{e.description}</Text>
                <Text style={styles.balance}>{formatMinor(e.amountMinor, currency)}</Text>
                <Text style={styles.expiry}>{formatClosetDateTime(e.createdAt)} · in your ledger</Text>
              </View>
            ))
          )}
        </View>
      ) : null}

      <InitiateForm />
    </View>
  );
}

function ReturnListCard({
  r,
  now,
  onView,
}: {
  r: {
    id: string;
    windowDeadline: string;
    state: string;
    refundMinor: number | null;
    tracking: string | null;
    merchant?: string | null;
    itemTitle?: string | null;
    purchaseId?: string | null;
    purchaseItemId?: string | null;
  };
  now: Date;
  onView: () => void;
}) {
  const c = returnCountdown(r.windowDeadline, now);
  const currency = useClosetPrefsStore((s) => s.preferredCurrency);
  const title = r.itemTitle?.trim() || r.merchant?.trim() || 'Return';
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <Text style={styles.merchant}>{title}</Text>
        <Text
          style={[
            styles.badge,
            r.state === 'EXPIRED' || r.state === 'CANCELLED'
              ? styles.badgeExpired
              : r.state === 'REFUNDED'
                ? styles.badgeOk
                : styles.badgeSoon,
          ]}
        >
          {returnStateLabel(r.state)}
        </Text>
      </View>
      <Text style={[styles.expiry, c.urgent ? styles.urgent : null]}>
        Deadline {formatClosetDate(r.windowDeadline)} · {c.label}
      </Text>
      {r.tracking ? <Text style={styles.expiry}>Tracking: {r.tracking}</Text> : null}
      {r.state === 'REFUNDED' && r.refundMinor != null ? (
        <Text style={styles.refundLanded}>
          Refund landed · {formatMinor(r.refundMinor, currency)}
        </Text>
      ) : null}
      <Button label="View" size="sm" variant="secondary" onPress={onView} />
    </View>
  );
}

function ReturnDetail({
  id,
  onBack,
  now,
  onRefundCelebrated,
}: {
  id: string;
  onBack: () => void;
  now: Date;
  onRefundCelebrated?: (body: string) => void;
}) {
  const { data, isLoading } = useReturnDetail(id);
  const confirm = useConfirmReturn();
  const refund = useMarkReturnRefunded();
  const bookPickup = useBookReturnPickup();
  const reschedulePickup = useRescheduleReturnPickup();
  const cancelPickup = useCancelReturnPickup();
  const snoozeChase = useSnoozeRefundChase();
  const escalateChase = useEscalateRefundChase();
  const correctWindow = useCorrectReturnWindow();
  const { data: sizeMap } = useSizeMap();
  const { data: etaBoard } = useRefundEtaBoard({ all: true });
  const [tracking, setTracking] = useState('');
  const [refundRupees, setRefundRupees] = useState('');
  const [refundDestination, setRefundDestination] =
    useState<RefundDestination>('ORIGINAL_CARD');
  const [askingFriends, setAskingFriends] = useState(false);
  const [slotIso, setSlotIso] = useState(() => suggestPickupSlots(now, 1)[0] ?? new Date().toISOString());
  const [tipDismissed, setTipDismissed] = useState<Set<string>>(() => new Set());
  const [portalReady, setPortalReady] = useState(false);
  const [windowEdit, setWindowEdit] = useState('');
  const [windowReason, setWindowReason] = useState('');
  const [windowError, setWindowError] = useState<string | null>(null);
  const [refundError, setRefundError] = useState<string | null>(null);
  const currency = useClosetPrefsStore((s) => s.preferredCurrency);
  const router = useRouter();

  if (isLoading) return <Text style={styles.muted}>Loading…</Text>;
  if (!data) return <Text style={styles.muted}>Not found</Text>;
  const r = data.request;
  const c = returnCountdown(r.windowDeadline, now);
  const timeline = returnStatusTimeline(r.state, data.events);
  const portalUrl =
    r.merchantReturnUrl?.trim() ||
    (r.merchant ? merchantReturnUrl(r.merchant) : null);
  const sizeTip = sizeMapTipForBrand(sizeMap?.brands ?? [], r.merchant, {
    orderedSize: r.orderedSize,
    preferredSize: r.preferredSize,
    reason: r.reason,
  });
  const tipVisible = sizeTip && !tipDismissed.has(sizeTip.dismissKey);
  const pickupSlots = suggestPickupSlots(now, 4);
  const portalFields = buildPortalFieldChecklist({
    orderRef: r.orderRef,
    skuOrTitle: r.itemTitle,
    reason: r.reason,
    merchant: r.merchant,
  });
  const etaRow = (etaBoard?.board ?? []).find((row) => row.returnId === r.id);
  const showChase = needsRefundChase({
    etaAt: etaRow?.etaAt,
    ledgerCredited: Boolean(etaRow?.ledgerCredited),
    chaseSnoozeUntil: r.chaseSnoozeUntil,
    now,
  });

  function openGstInvoice() {
    const href = gstInvoiceHrefFromReturn({
      merchant: r.merchant,
      createdAt: r.createdAt,
    });
    trackEvent('gst_invoice_from_return', {
      returnId: r.id,
      hasMerchant: Boolean(r.merchant?.trim()),
    });
    router.push(href as never);
  }

  async function askFriendsShouldReturn() {
    const token = useSessionStore.getState().accessToken;
    if (!token) {
      Alert.alert('Sign in', 'Sign in to ask friends about this return.');
      return;
    }
    setAskingFriends(true);
    try {
      const poll = await createReturnPoll(token, {
        itemLabel: returnPollItemLabel({
          itemTitle: r.itemTitle,
          merchant: r.merchant,
        }),
        returnRequestId: r.id,
      });
      await Share.share({ message: poll.shareText });
      trackEvent('return_poll_created', { pollId: poll.id });
    } catch (e) {
      Alert.alert('Could not create poll', closetAlertText(e));
    } finally {
      setAskingFriends(false);
    }
  }

  function openMerchantPortal() {
    if (!portalUrl) return;
    if (!portalReady && portalFields.length > 0) {
      Alert.alert('Portal checklist', 'Copy order ID / SKU / reason first, then open portal.');
      return;
    }
    trackEvent('return_portal_open', returnPortalOpenProps(r.id, r.merchant));
    void Linking.openURL(portalUrl).catch(() => {
      Alert.alert('Could not open portal', portalUrl);
    });
  }

  async function copyPortalField(label: string, value: string) {
    try {
      await Share.share({ message: value });
      trackEvent('return_portal_field_copy', { returnId: r.id, field: label });
      setPortalReady(true);
    } catch {
      Alert.alert(label, value);
      setPortalReady(true);
    }
  }

  return (
    <View>
      <Button label="Back" size="sm" variant="ghost" onPress={onBack} />
      <View style={styles.card}>
        <Text style={styles.merchant}>
          {r.itemTitle?.trim() || r.merchant?.trim() || 'Return'}
        </Text>
        <Text style={styles.expiry}>Status: {returnStateLabel(r.state)}</Text>
        <Text style={[styles.expiry, c.urgent ? styles.urgent : null]}>
          Deadline: {formatClosetDateTime(r.windowDeadline)} · {c.label}
        </Text>
        {r.pickupSlotAt ? (
          <Text style={styles.expiry} testID="pickup-slot-shown">
            Pickup: {formatClosetDateTime(r.pickupSlotAt)}
          </Text>
        ) : null}
        {r.refundMinor != null && r.refundMinor > 0 ? (
          <Text style={styles.refundLanded}>
            Refund: {formatMinor(r.refundMinor, currency)}
            {r.state === 'REFUNDED' ? ' · landed in vault' : ''}
          </Text>
        ) : null}
        {portalUrl ? (
          <View testID="portal-field-checklist">
            <Text style={styles.muted}>Before leaving: copy portal fields</Text>
            {portalFields.map((f) => (
              <Button
                key={f.id}
                label={`Copy ${f.label}: ${f.value}`}
                size="sm"
                variant="ghost"
                onPress={() => void copyPortalField(f.label, f.value)}
              />
            ))}
            <Button
              label={portalReady || portalFields.length === 0 ? 'Open merchant return portal' : 'Open portal (after copy)'}
              size="sm"
              variant="secondary"
              onPress={openMerchantPortal}
            />
          </View>
        ) : null}
        <View style={styles.form} testID="return-window-correct">
          <Text style={styles.muted}>Merchant gave a different last day? Correct it here.</Text>
          <TextInput
            style={styles.input}
            placeholder="Last day to return (YYYY-MM-DD)"
            placeholderTextColor={textMuted}
            value={windowEdit}
            onChangeText={(v) => {
              setWindowEdit(v);
              setWindowError(null);
            }}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            accessibilityLabel="Last day to return"
          />
          <TextInput
            style={styles.input}
            placeholder="Reason for correction"
            placeholderTextColor={textMuted}
            value={windowReason}
            onChangeText={setWindowReason}
          />
          <Button
            label={correctWindow.isPending ? 'Saving…' : 'Save window'}
            size="sm"
            disabled={correctWindow.isPending || !windowEdit.trim() || !windowReason.trim()}
            onPress={() => {
              // The end of that day on this phone; a bad date used to throw out of the handler.
              const iso = endOfDayKeyIso(windowEdit);
              if (!iso) {
                setWindowError('Enter the date as YYYY-MM-DD, for example 2026-11-03.');
                return;
              }
              correctWindow.mutate(
                { id, windowDeadline: iso, reason: windowReason.trim() },
                {
                  onSuccess: () => {
                    setWindowEdit('');
                    setWindowReason('');
                    Alert.alert('Window updated', 'Deadline reminder rescheduled.');
                  },
                  onError: (e) => Alert.alert('Failed', closetAlertText(e)),
                },
              );
            }}
          />
          {windowError ? (
            <Text style={[styles.expiry, styles.urgent]} testID="return-window-error" accessibilityLiveRegion="polite">
              {windowError}
            </Text>
          ) : null}
        </View>
        {showChase ? (
          <View style={styles.form} testID="refund-chase-checklist">
            <Text style={styles.sectionTitle}>Refund chase</Text>
            <Text style={styles.muted}>ETA overdue and not in ledger yet.</Text>
            {REFUND_CHASE_STEPS.map((step) => (
              <Text key={step.id} style={styles.expiry}>
                • {step.label} — {step.hint}
              </Text>
            ))}
            <Button
              label={snoozeChase.isPending ? 'Snoozing…' : 'Snooze 3 days'}
              size="sm"
              variant="secondary"
              disabled={snoozeChase.isPending}
              onPress={() =>
                snoozeChase.mutate(
                  { id },
                  { onError: (e) => Alert.alert('Failed', closetAlertText(e)) },
                )
              }
            />
            <Button
              label={
                r.chaseEscalated
                  ? 'Escalated for ops'
                  : escalateChase.isPending
                    ? 'Escalating…'
                    : 'Escalate for ops'
              }
              size="sm"
              variant="ghost"
              disabled={escalateChase.isPending || Boolean(r.chaseEscalated)}
              onPress={() =>
                escalateChase.mutate(
                  { id },
                  { onError: (e) => Alert.alert('Failed', closetAlertText(e)) },
                )
              }
            />
          </View>
        ) : null}
        {r.state !== 'REFUNDED' && r.state !== 'EXPIRED' && r.state !== 'CANCELLED' ? (
          <Button
            label={askingFriends ? 'Sharing…' : 'Ask friends: keep or return?'}
            size="sm"
            variant="secondary"
            disabled={askingFriends}
            onPress={() => void askFriendsShouldReturn()}
          />
        ) : null}
        {r.merchant?.trim() ? (
          <Button
            label="Find GST / invoice"
            size="sm"
            variant="ghost"
            onPress={openGstInvoice}
          />
        ) : null}
        {r.merchant?.trim() ? (
          <Button
            label={
              r.invoiceRequestedAt
                ? r.invoiceVaultHref
                  ? 'Invoice requested · open vault'
                  : 'Invoice requested'
                : 'Request GST invoice'
            }
            size="sm"
            variant="secondary"
            testID="request-gst-invoice"
            onPress={() => {
              void (async () => {
                const token = useSessionStore.getState().accessToken;
                if (!token) {
                  Alert.alert('Sign in', 'Sign in to request a GST invoice.');
                  return;
                }
                try {
                  const { requestGstInvoice } = await import('@/src/api/client');
                  const res = await requestGstInvoice(token, r.id);
                  trackEvent('gst_invoice_requested', { returnId: r.id });
                  if (res.packet.requestUrl) {
                    await Linking.openURL(res.packet.requestUrl).catch(() => undefined);
                  } else {
                    await Share.share({ message: res.packet.shareText });
                  }
                  if (res.request.invoiceVaultHref) {
                    router.push(res.request.invoiceVaultHref as never);
                  }
                } catch (e) {
                  Alert.alert('Could not request invoice', closetAlertText(e));
                }
              })();
            }}
          />
        ) : null}
        {r.labelImageKey ? (
          <View testID="return-label-block">
            <Text style={styles.expiry}>
              {r.labelUsedAt ? 'Return label used' : 'Return label ready for pickup agent'}
            </Text>
            {!r.labelUsedAt ? (
              <Button
                label="Mark label used"
                size="sm"
                variant="ghost"
                onPress={() => {
                  void (async () => {
                    const token = useSessionStore.getState().accessToken;
                    if (!token) return;
                    try {
                      const { markReturnLabelUsed } = await import('@/src/api/client');
                      await markReturnLabelUsed(token, r.id);
                      trackEvent('return_label_used', { returnId: r.id });
                    } catch (e) {
                      Alert.alert('Could not mark label', closetAlertText(e));
                    }
                  })();
                }}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      {tipVisible && sizeTip ? (
        <View style={styles.tipCard} testID="size-map-tip">
          <Text style={styles.tipHeadline}>{sizeTip.headline}</Text>
          <Text style={styles.tipBody}>{sizeTip.body}</Text>
          <Button
            label="Dismiss"
            size="sm"
            variant="ghost"
            onPress={() => {
              setTipDismissed((prev) => new Set(prev).add(sizeTip.dismissKey));
              trackEvent('size_map_tip_dismiss', { brand: sizeTip.brand });
            }}
          />
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Status</Text>
      <View style={styles.timeline}>
        {timeline.map((step, index) => (
          <View key={step.id} style={styles.timelineStep}>
            <View
              style={[
                styles.dot,
                step.state === 'done' && styles.dotDone,
                step.state === 'current' && styles.dotCurrent,
                step.state === 'failed' && styles.dotFailed,
              ]}
            />
            {index < timeline.length - 1 ? (
              <View
                style={[
                  styles.connector,
                  (step.state === 'done' || step.state === 'current') && styles.connectorActive,
                ]}
              />
            ) : null}
            <View style={styles.timelineBody}>
              <Text
                style={[
                  styles.timelineLabel,
                  step.state === 'todo' && styles.timelineTodo,
                  step.state === 'failed' && styles.timelineFailed,
                ]}
              >
                {step.label}
              </Text>
              {step.at ? (
                <Text style={styles.expiry}>{formatClosetDateTime(step.at)}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>

      {r.state === 'INITIATED' ? (
        <View style={styles.form} testID="pickup-slot-cal">
          <Text style={styles.muted}>Pick a pickup slot, then confirm when the courier has it.</Text>
          <View style={styles.slotRow}>
            {pickupSlots.map((slot) => (
              <Button
                key={slot}
                label={formatClosetDateTime(slot)}
                size="sm"
                variant={slotIso === slot ? 'primary' : 'secondary'}
                onPress={() => setSlotIso(slot)}
              />
            ))}
          </View>
          <View style={styles.slotRow}>
            <Button
              label="−1h"
              size="sm"
              variant="ghost"
              onPress={() => setSlotIso((s) => nudgePickupSlotHours(s, -1))}
            />
            <Text style={styles.expiry}>{formatClosetDateTime(slotIso)}</Text>
            <Button
              label="+1h"
              size="sm"
              variant="ghost"
              onPress={() => setSlotIso((s) => nudgePickupSlotHours(s, 1))}
            />
          </View>
          <Button
            label={bookPickup.isPending ? 'Booking…' : 'Book pickup'}
            disabled={bookPickup.isPending}
            onPress={() =>
              bookPickup.mutate(
                { id, pickupSlotAt: slotIso },
                { onError: (e) => Alert.alert('Failed', closetAlertText(e)) },
              )
            }
          />
          <TextInput
            style={styles.input}
            placeholder="Tracking (optional)"
            placeholderTextColor={textMuted}
            value={tracking}
            onChangeText={setTracking}
          />
          <Button
            label="Confirm return"
            disabled={confirm.isPending}
            onPress={() =>
              confirm.mutate(
                { id, tracking: tracking || undefined },
                { onError: (e) => Alert.alert('Failed', closetAlertText(e)) },
              )
            }
          />
        </View>
      ) : null}

      {r.state === 'PICKUP_SCHEDULED' ? (
        <View style={styles.form} testID="pickup-reschedule">
          {r.pickupSlotAt ? (
            <Text style={styles.expiry}>Pickup booked: {formatClosetDateTime(r.pickupSlotAt)}</Text>
          ) : null}
          <View style={styles.slotRow}>
            {pickupSlots.map((slot) => (
              <Button
                key={slot}
                label={formatClosetDateTime(slot)}
                size="sm"
                variant={slotIso === slot ? 'primary' : 'secondary'}
                onPress={() => setSlotIso(slot)}
              />
            ))}
          </View>
          <Button
            label={reschedulePickup.isPending ? 'Rescheduling…' : 'Reschedule pickup'}
            size="sm"
            disabled={reschedulePickup.isPending}
            onPress={() =>
              reschedulePickup.mutate(
                { id, pickupSlotAt: slotIso },
                { onError: (e) => Alert.alert('Failed', closetAlertText(e)) },
              )
            }
          />
          <Button
            label={cancelPickup.isPending ? 'Cancelling…' : 'Cancel pickup'}
            size="sm"
            variant="ghost"
            disabled={cancelPickup.isPending}
            onPress={() =>
              cancelPickup.mutate(
                { id },
                { onError: (e) => Alert.alert('Failed', closetAlertText(e)) },
              )
            }
          />
          <TextInput
            style={styles.input}
            placeholder="Tracking (optional)"
            placeholderTextColor={textMuted}
            value={tracking}
            onChangeText={setTracking}
          />
          <Button
            label="Confirm return"
            disabled={confirm.isPending}
            onPress={() =>
              confirm.mutate(
                { id, tracking: tracking || undefined },
                { onError: (e) => Alert.alert('Failed', closetAlertText(e)) },
              )
            }
          />
        </View>
      ) : null}

      {r.state === 'CONFIRMED' ? (
        <View style={styles.form}>
          <Text style={styles.muted}>
            When the merchant refunds you, mark where it landed — we post to money_ledger.
          </Text>
          <Text style={styles.muted} accessibilityLabel="Refund destination">
            Refund destination
          </Text>
          <View style={styles.slotRow}>
            {(['ORIGINAL_CARD', 'STORE_CREDIT', 'UPI'] as const).map((d) => (
              <Button
                key={d}
                label={REFUND_DESTINATION_LABELS[d]}
                size="sm"
                variant={refundDestination === d ? 'primary' : 'secondary'}
                accessibilityLabel={`Refund to ${REFUND_DESTINATION_LABELS[d]}`}
                onPress={() => setRefundDestination(d)}
              />
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder={`Refund amount in ${currency} (optional, defaults to the purchase)`}
            placeholderTextColor={textMuted}
            keyboardType="decimal-pad"
            value={refundRupees}
            onChangeText={(v) => {
              setRefundRupees(v);
              setRefundError(null);
            }}
            accessibilityLabel="Refund amount"
          />
          {refundError ? (
            <Text style={[styles.expiry, styles.urgent]} testID="refund-amount-error" accessibilityLiveRegion="polite">
              {refundError}
            </Text>
          ) : null}
          <Button
            label={refund.isPending ? 'Posting…' : 'Mark refunded'}
            disabled={refund.isPending}
            onPress={() => {
              // Blank means "the purchase price"; anything else typed must be a real amount, never a silent default.
              const refundMinor = refundRupees.trim() ? parseAmountInput(refundRupees, currency) : undefined;
              if (refundMinor === null) {
                setRefundError('Enter the refund as an amount above zero, or leave it blank.');
                return;
              }
              refund.mutate(
                { id, refundMinor, destination: refundDestination },
                {
                  onSuccess: (res) => {
                    void delightHapticRefundLanded();
                    const celeb = markRefundedCelebration({
                      refundMinor: res.refundMinor,
                    });
                    Alert.alert(celeb.title, celeb.body);
                    onRefundCelebrated?.(celeb.body);
                  },
                  onError: (e) => Alert.alert('Failed', closetAlertText(e)),
                },
              );
            }}
          />
        </View>
      ) : null}

      {r.state === 'REQUESTED' ? (
        <View style={styles.form}>
          <InitiateExisting id={id} />
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Event log</Text>
      {data.events.length === 0 ? <Text style={styles.muted}>No events yet.</Text> : null}
      {data.events.map((e) => (
        <View key={e.id} style={styles.card}>
          <Text style={styles.expiry}>
            {returnStateLabel(e.fromState)} → {returnStateLabel(e.toState)}
          </Text>
          <Text style={styles.expiry}>{formatClosetDateTime(e.createdAt)}</Text>
        </View>
      ))}
    </View>
  );
}

function InitiateExisting({ id }: { id: string }) {
  const initiate = useInitiateReturn();
  return (
    <Button
      label="Initiate return"
      disabled={initiate.isPending}
      onPress={() =>
        initiate.mutate(
          { id },
          { onError: (e) => Alert.alert('Failed', closetAlertText(e)) },
        )
      }
    />
  );
}

function InitiateForm() {
  const initiate = useInitiateReturn();
  const create = useCreateReturnLocal();
  const markDeadlineSetup = useClosetStore((s) => s.markDeadlineSetup);
  const { data: purchasesData } = usePurchases();
  const purchases = purchasesData?.purchases ?? [];
  const [purchaseId, setPurchaseId] = useState('');
  const [reason, setReason] = useState<(typeof SIZE_RETURN_REASONS)[number]>('TOO_SMALL');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const selectedRow = purchases.find((p) => p.purchase.id === purchaseId);
  const items = selectedRow?.items ?? [];

  function toggleItem(itemId: string) {
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((x) => x !== itemId) : [...prev, itemId],
    );
  }

  async function startReturns() {
    try {
      if (selectedItemIds.length > 0) {
        for (const itemId of selectedItemIds) {
          await create(itemId, reason);
        }
      } else if (purchaseId) {
        await create(purchaseId, reason);
      } else {
        return;
      }
      setPurchaseId('');
      setSelectedItemIds([]);
      markDeadlineSetup();
      Alert.alert('Return opened', 'Continue on this list — one initiate per item when split.');
    } catch (e) {
      Alert.alert('Failed', closetAlertText(e));
    }
  }

  return (
    <View style={styles.form} testID="initiate-return-form">
      <Text style={styles.sectionTitle}>Initiate return</Text>
      {purchases.length === 0 ? <Text style={styles.muted}>Purchases you add show up here.</Text> : null}
      {purchases.slice(0, 6).map((row) => (
        <Button
          key={row.purchase.id}
          label={`${row.purchase.merchant} · ${row.items.length} item(s)`}
          size="sm"
          variant={purchaseId === row.purchase.id ? 'primary' : 'secondary'}
          onPress={() => {
            setPurchaseId(row.purchase.id);
            setSelectedItemIds([]);
          }}
        />
      ))}
      {items.length > 1 ? (
        <View testID="multi-item-return-split">
          <Text style={styles.muted}>Select items to split (one return each)</Text>
          {items.map((item) => (
            <Button
              key={item.id}
              label={`${selectedItemIds.includes(item.id) ? '✓ ' : ''}${item.title}`}
              size="sm"
              variant={selectedItemIds.includes(item.id) ? 'primary' : 'ghost'}
              onPress={() => toggleItem(item.id)}
            />
          ))}
        </View>
      ) : null}
      <Text style={styles.muted}>Reason</Text>
      <View style={styles.slotRow}>
        {SIZE_RETURN_REASONS.map((code) => (
          <Button
            key={code}
            label={code.charAt(0) + code.slice(1).replace(/_/g, ' ').toLowerCase()}
            size="sm"
            variant={reason === code ? 'primary' : 'secondary'}
            onPress={() => setReason(code)}
          />
        ))}
      </View>
      <Button
        label={initiate.isPending ? 'Starting…' : 'Initiate'}
        disabled={initiate.isPending || !purchaseId}
        onPress={() => void startReturns()}
      />
    </View>
  );
}

/** Local helper so InitiateForm can create per-item returns with reason. */
function useCreateReturnLocal() {
  const initiate = useInitiateReturn();
  return (id: string, reason: string) =>
    new Promise<void>((resolve, reject) => {
      initiate.mutate(
        { id, reason },
        {
          onSuccess: () => resolve(),
          onError: (e) => reject(e),
        },
      );
    });
}

const styles = StyleSheet.create({
  list: { marginTop: space4 },
  card: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    marginBottom: space4,
    padding: space4,
    gap: space3,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  merchant: { color: text, fontFamily: fontSansSemiBold, fontSize: fsBody, flexShrink: 1, paddingRight: 8 },
  balance: { color: text, fontFamily: fontSansSemiBold, fontSize: fsBody, marginTop: 2 },
  expiry: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption, marginTop: 2 },
  urgent: { color: '#9a6700', fontWeight: '600' },
  refundLanded: {
    color: closet.found,
    fontFamily: fontSansSemiBold,
    fontSize: fsCaption,
    marginTop: 4,
  },
  muted: { color: textMuted, fontFamily: fontSans, fontSize: fsBody },
  boardHint: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    marginBottom: space4,
  },
  pipelineLine: {
    color: text,
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
    marginTop: 4,
  },
  sectionTitle: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
    marginTop: space6,
    marginBottom: space4,
  },
  form: { gap: space4, marginTop: space4 },
  input: {
    backgroundColor: bg,
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  badge: {
    borderRadius: radiusMd,
    fontFamily: fontSans,
    fontSize: fsCaption,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeExpired: { backgroundColor: '#fde2e1', color: '#b3261e' },
  badgeSoon: { backgroundColor: '#fff1d6', color: '#9a6700' },
  badgeOk: { backgroundColor: '#e3f4e1', color: '#1e7a32' },
  timeline: { marginBottom: space4 },
  timelineStep: {
    flexDirection: 'row',
    gap: 12,
    minHeight: 44,
    paddingLeft: 4,
    position: 'relative',
  },
  timelineBody: { flex: 1, paddingBottom: space4 },
  timelineLabel: { color: text, fontFamily: fontSansSemiBold, fontSize: fsBody },
  timelineTodo: { color: textMuted, fontWeight: '400' },
  timelineFailed: { color: '#b3261e' },
  dot: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: 8,
    borderWidth: 2,
    height: 16,
    marginTop: 2,
    width: 16,
    zIndex: 1,
  },
  dotDone: { backgroundColor: closet.accent, borderColor: closet.accent },
  dotCurrent: { borderColor: closet.accent, backgroundColor: closet.accentBg },
  dotFailed: { backgroundColor: '#fde2e1', borderColor: '#b3261e' },
  connector: {
    backgroundColor: border,
    bottom: 0,
    left: 11,
    position: 'absolute',
    top: 18,
    width: 2,
  },
  connectorActive: { backgroundColor: closet.accentSoft },
  expiredWrap: { marginTop: space4, gap: space3 },
  celebrate: {
    backgroundColor: closet.accentBg,
    borderColor: closet.accentSoft,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: space3,
    marginBottom: space4,
    padding: space4,
  },
  celebrateTitle: {
    color: closet.found,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  celebrateBody: { color: text, fontFamily: fontSans, fontSize: fsCaption },
  tipCard: {
    backgroundColor: closet.accentBg,
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: space3,
    marginBottom: space4,
    padding: space4,
  },
  tipHeadline: { color: text, fontFamily: fontSansSemiBold, fontSize: fsBody },
  tipBody: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space3, alignItems: 'center' },
});

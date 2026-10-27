import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  buildExchangeSizePrefill,
  carrierTrackingUrl,
  detectCarrierFromTracking,
  formatMinor,
  packageDeliveryTimeline,
  type DetectedCarrier,
} from '@worn/shared';
import { useRouter } from 'expo-router';

import { Button } from '@/src/components/ui';
import { ClosetVirtualList } from '@/src/components/ClosetVirtualList';
import {
  useCreateReturn,
  useExchanges,
  useFixRtoAddress,
  useMarkPackageDelivered,
  usePackages,
  useRtoRecovery,
  useSizeMap,
  useStartRtoRefund,
  useUpdatePackage,
} from '@/src/hooks/closet/useCloset';
import { trackEvent } from '@/src/lib/analytics';
import { formatClosetDate } from '@/src/lib/format';
import { closetAlertText } from '@/src/lib/closetScreenState';
import {
  border,
  fontSans,
  fontSansSemiBold,
  fontSansMedium,
  fsBody,
  fsCaption,
  radiusMd,
  space4,
  space6,
  surface,
  text,
  textMuted,
} from '@/src/theme/tokens';

/** N09 packages + N10 exchange + N15 RTO — Vault Recover / Packages tab. */
export function PackagesPanel() {
  const packages = usePackages();
  const exchanges = useExchanges();
  const rto = useRtoRecovery();
  const markDelivered = useMarkPackageDelivered();
  const startRto = useStartRtoRefund();
  const createReturn = useCreateReturn();
  const updatePkg = useUpdatePackage();
  const fixAddress = useFixRtoAddress();
  const { data: sizeMap } = useSizeMap();
  const router = useRouter();
  const inTransit = packages.data?.packages ?? [];
  const exchangeRows = exchanges.data?.exchanges ?? [];
  const rtoBoard = rto.data?.board ?? [];
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, string>>({});
  const [addressDrafts, setAddressDrafts] = useState<Record<string, string>>({});
  const [exchangeSizeDrafts, setExchangeSizeDrafts] = useState<Record<string, string>>({});

  return (
    <View>
      <Text style={styles.sectionTitle}>Failed delivery (RTO)</Text>
      <Text style={styles.hint}>
        Checklist after a failed delivery — contact merchant, open refund, track to ledger.
      </Text>
      {rto.isLoading ? <Text style={styles.muted}>Loading RTO board…</Text> : null}
      {!rto.isLoading && rtoBoard.length === 0 ? (
        <Text style={styles.muted}>No failed deliveries needing recovery.</Text>
      ) : null}
      <ClosetVirtualList
        data={rtoBoard}
        keyExtractor={(row) => row.purchaseId}
        testID="packages-rto-list"
        renderItem={({ item: row }) => {
          const openRefund = row.checklist.find((s) => s.id === 'OPEN_REFUND');
          const showStartRefund =
            row.deliveryStatus === 'FAILED' && openRefund?.state === 'current';
          const addressDraft = addressDrafts[row.purchaseId] ?? row.deliveryAddressNote ?? '';
          return (
            <View style={styles.card}>
              <Text style={styles.merchant}>{row.merchant}</Text>
              <Text style={styles.meta}>
                {row.deliveryStatus.replace(/_/g, ' ')}
                {row.failedAt ? ` · failed ${formatClosetDate(row.failedAt)}` : ''}
                {` · ${formatMinor(row.totalMinor, row.currency)}`}
              </Text>
              <View style={styles.timeline}>
                {row.checklist.map((step, index) => (
                  <View key={step.id} style={styles.timelineStep}>
                    <View
                      style={[
                        styles.dot,
                        step.state === 'done' && styles.dotDone,
                        step.state === 'current' && styles.dotCurrent,
                      ]}
                    />
                    {index < row.checklist.length - 1 ? (
                      <View
                        style={[
                          styles.connector,
                          (step.state === 'done' || step.state === 'current') &&
                            styles.connectorActive,
                        ]}
                      />
                    ) : null}
                    <Text
                      style={[
                        styles.timelineLabel,
                        step.state === 'todo' && styles.timelineTodo,
                      ]}
                    >
                      {step.label}
                    </Text>
                  </View>
                ))}
              </View>
              {row.deliveryStatus === 'FAILED' ? (
                <View testID={`rto-address-fix-${row.purchaseId}`}>
                  <TextInput
                    style={styles.input}
                    placeholder="Correct delivery address note"
                    placeholderTextColor={textMuted}
                    value={addressDraft}
                    onChangeText={(v) =>
                      setAddressDrafts((prev) => ({ ...prev, [row.purchaseId]: v }))
                    }
                  />
                  <Button
                    label={fixAddress.isPending ? 'Saving…' : 'Save address · reattempt'}
                    size="sm"
                    variant="secondary"
                    disabled={fixAddress.isPending || !addressDraft.trim()}
                    onPress={() =>
                      fixAddress.mutate(
                        {
                          purchaseId: row.purchaseId,
                          deliveryAddressNote: addressDraft.trim(),
                          reattempt: true,
                        },
                        {
                          onSuccess: () =>
                            Alert.alert('Reattempt queued', 'Status set to shipped for redelivery.'),
                          onError: (e) => Alert.alert('Failed', closetAlertText(e)),
                        },
                      )
                    }
                  />
                  {(row.deliveryProofKeys ?? []).length > 0 ? (
                    <Text style={styles.meta}>
                      Proof photos: {(row.deliveryProofKeys ?? []).length}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {showStartRefund ? (
                <Button
                  label={startRto.isPending ? 'Starting…' : 'Start refund'}
                  size="sm"
                  disabled={startRto.isPending}
                  onPress={() =>
                    startRto.mutate(
                      { purchaseId: row.purchaseId },
                      {
                        onSuccess: () =>
                          Alert.alert('Refund opened', 'Track progress on the Returns tab.'),
                        onError: (e) =>
                          Alert.alert('Could not start refund', closetAlertText(e)),
                      },
                    )
                  }
                />
              ) : null}
              {row.refundTrack ? (
                <Text style={styles.meta}>
                  Refund {row.refundTrack.state}
                  {row.refundTrack.etaAt
                    ? ` · ETA ${formatClosetDate(row.refundTrack.etaAt)}`
                    : ''}
                </Text>
              ) : null}
            </View>
          );
        }}
      />

      <Text style={[styles.sectionTitle, { marginTop: space6 }]}>In transit</Text>
      {packages.isLoading ? <Text style={styles.muted}>Loading packages…</Text> : null}
      {!packages.isLoading && inTransit.length === 0 ? (
        <Text style={styles.muted}>No packages on the way. Connect email to track hauls.</Text>
      ) : null}
      <ClosetVirtualList
        data={inTransit}
        keyExtractor={(p) => p.id}
        testID="packages-in-transit-list"
        renderItem={({ item: p }) => {
          const timeline = packageDeliveryTimeline(p.deliveryStatus);
          const draft = trackingDrafts[p.id] ?? p.trackingCode ?? '';
          const detected = detectCarrierFromTracking(draft);
          return (
            <View style={styles.card}>
              <Text style={styles.merchant}>{p.merchant}</Text>
              <Text style={styles.meta}>
                {p.deliveryStatus.replace(/_/g, ' ')}
                {p.etaAt ? ` · ETA ${formatClosetDate(p.etaAt)}` : ''}
              </Text>
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
                          (step.state === 'done' || step.state === 'current') &&
                            styles.connectorActive,
                        ]}
                      />
                    ) : null}
                    <Text
                      style={[
                        styles.timelineLabel,
                        step.state === 'todo' && styles.timelineTodo,
                        step.state === 'failed' && styles.timelineFailed,
                      ]}
                    >
                      {step.label}
                    </Text>
                  </View>
                ))}
              </View>
              {(p.itemTitles ?? []).slice(0, 2).map((t) => (
                <Text key={t} style={styles.item}>
                  {t}
                </Text>
              ))}
              <View testID={`tracking-paste-${p.id}`}>
                <TextInput
                  style={styles.input}
                  placeholder="Paste tracking number"
                  placeholderTextColor={textMuted}
                  value={draft}
                  onChangeText={(v) => setTrackingDrafts((prev) => ({ ...prev, [p.id]: v }))}
                  autoCapitalize="characters"
                />
                {detected ? (
                  <Text style={styles.meta}>
                    Carrier {detected.carrier}
                    {p.carrier ? ` · saved ${p.carrier}` : ''}
                  </Text>
                ) : null}
                <Button
                  label={updatePkg.isPending ? 'Saving…' : 'Save tracking'}
                  size="sm"
                  variant="secondary"
                  disabled={updatePkg.isPending || !detected}
                  onPress={() => {
                    if (!detected) return;
                    updatePkg.mutate(
                      {
                        id: p.id,
                        trackingCode: detected.trackingCode,
                        carrier: detected.carrier,
                        deliveryStatus:
                          p.deliveryStatus === 'ORDERED' ? 'SHIPPED' : p.deliveryStatus,
                      },
                      {
                        onSuccess: () => {
                          trackEvent('package_tracking_pasted' as never, {
                            carrier: detected.carrier,
                          });
                          const url = carrierTrackingUrl(
                            detected.carrier as DetectedCarrier,
                            detected.trackingCode,
                          );
                          if (url) {
                            Alert.alert('Tracking saved', 'Open carrier page?', [
                              { text: 'Later', style: 'cancel' },
                              {
                                text: 'Open',
                                onPress: () => void Linking.openURL(url),
                              },
                            ]);
                          }
                        },
                        onError: (e) => Alert.alert('Failed', closetAlertText(e)),
                      },
                    );
                  }}
                />
                <View style={styles.ctaRow}>
                  {(['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const).map((status) => (
                    <Button
                      key={status}
                      label={status.replace(/_/g, ' ')}
                      size="sm"
                      variant="ghost"
                      onPress={() =>
                        updatePkg.mutate(
                          { id: p.id, deliveryStatus: status },
                          { onError: (e) => Alert.alert('Failed', closetAlertText(e)) },
                        )
                      }
                    />
                  ))}
                </View>
              </View>
              <Button
                label={markDelivered.isPending ? 'Saving…' : 'Mark delivered · add to wardrobe'}
                size="sm"
                disabled={markDelivered.isPending}
                onPress={() =>
                  markDelivered.mutate(
                    { id: p.id, addToWardrobe: true },
                    {
                      onSuccess: () => Alert.alert('Delivered', 'Added to wardrobe when possible.'),
                      onError: (e) => Alert.alert('Could not update', closetAlertText(e)),
                    },
                  )
                }
              />
            </View>
          );
        }}
      />

      <Text style={[styles.sectionTitle, { marginTop: space6 }]}>Exchange windows</Text>
      <Text style={styles.hint}>
        Size swaps often close before refund windows — we track both separately.
      </Text>
      {exchanges.isLoading ? <Text style={styles.muted}>Loading exchanges…</Text> : null}
      {!exchanges.isLoading && exchangeRows.length === 0 ? (
        <Text style={styles.muted}>No open exchange windows.</Text>
      ) : null}
      <ClosetVirtualList
        data={exchangeRows}
        keyExtractor={(e) => e.purchaseId}
        testID="packages-exchange-list"
        renderItem={({ item: e }) => {
          const prefill = buildExchangeSizePrefill({
            brands: sizeMap?.brands ?? [],
            merchant: e.merchant,
          });
          const sizeDraft =
            exchangeSizeDrafts[e.purchaseId] ?? prefill.recommendedSize ?? '';
          return (
            <View style={styles.card}>
              <Text style={styles.merchant}>{e.merchant}</Text>
              <Text style={styles.meta}>
                Exchange{' '}
                {e.exchangeWindowDeadline
                  ? formatClosetDate(e.exchangeWindowDeadline)
                  : '—'}
                {e.daysLeftExchange != null ? ` · ${e.daysLeftExchange}d left` : ''}
              </Text>
              <Text style={styles.meta}>
                Return{' '}
                {e.returnWindowDeadline
                  ? formatClosetDate(e.returnWindowDeadline)
                  : '—'}
                {e.daysLeftReturn != null ? ` · ${e.daysLeftReturn}d left` : ''}
              </Text>
              {e.windowsDiffer ? (
                <Text style={styles.differ}>Exchange window ≠ return window for this merchant</Text>
              ) : null}
              <View testID={`exchange-size-prefill-${e.purchaseId}`}>
                <Text style={styles.meta}>Recommended size (editable — never auto-submit)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Size"
                  placeholderTextColor={textMuted}
                  value={sizeDraft}
                  onChangeText={(v) =>
                    setExchangeSizeDrafts((prev) => ({ ...prev, [e.purchaseId]: v }))
                  }
                />
              </View>
              <View style={styles.ctaRow}>
                <Button
                  label="Start exchange"
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    trackEvent('exchange_cta_tap', {
                      purchaseId: e.purchaseId,
                      recommendedSize: sizeDraft || null,
                      autoSubmit: false,
                    });
                    Alert.alert(
                      'Exchange',
                      `Open ${e.merchant} to request size ${sizeDraft || '(edit above)'} before the deadline. We never auto-submit.`,
                    );
                  }}
                />
                {e.windowsDiffer ? (
                  <Button
                    label={createReturn.isPending ? 'Opening…' : 'Start return'}
                    size="sm"
                    disabled={createReturn.isPending}
                    onPress={() =>
                      createReturn.mutate(
                        { purchaseId: e.purchaseId },
                        {
                          onSuccess: () => {
                            Alert.alert('Return opened', 'Continue on the Returns tab.');
                            router.push('/(closet)/vault?focus=returns' as never);
                          },
                          onError: (err) =>
                            Alert.alert('Could not start return', closetAlertText(err)),
                        },
                      )
                    }
                  />
                ) : null}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
    color: text,
    marginBottom: space4,
  },
  hint: {
    fontFamily: fontSans,
    fontSize: fsCaption,
    color: textMuted,
    marginBottom: space4,
  },
  muted: {
    fontFamily: fontSans,
    fontSize: fsCaption,
    color: textMuted,
    marginBottom: space4,
  },
  card: {
    backgroundColor: surface,
    borderRadius: radiusMd,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: border,
    padding: space4,
    marginBottom: space4,
    gap: 6,
  },
  merchant: {
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
    color: text,
  },
  meta: {
    fontFamily: fontSans,
    fontSize: fsCaption,
    color: textMuted,
  },
  item: {
    fontFamily: fontSans,
    fontSize: fsCaption,
    color: text,
  },
  differ: {
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
    color: text,
  },
  ctaRow: {
    gap: 8,
    marginTop: 4,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: border,
    borderRadius: radiusMd,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: text,
    fontFamily: fontSans,
    fontSize: fsCaption,
    marginTop: 4,
  },
  timeline: { marginTop: 4, marginBottom: 4 },
  timelineStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 28,
    paddingLeft: 2,
  },
  timelineLabel: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsCaption,
    marginLeft: 12,
    paddingBottom: 8,
  },
  timelineTodo: { color: textMuted, fontWeight: '400' },
  timelineFailed: { color: '#b3261e' },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: border,
    marginTop: 4,
    zIndex: 1,
  },
  dotDone: { backgroundColor: text },
  dotCurrent: { backgroundColor: text, borderWidth: 2, borderColor: surface },
  dotFailed: { backgroundColor: '#b3261e' },
  connector: {
    position: 'absolute',
    left: 5,
    top: 14,
    bottom: 0,
    width: 2,
    backgroundColor: border,
  },
  connectorActive: { backgroundColor: text },
});

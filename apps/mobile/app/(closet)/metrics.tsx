import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollView,
} from 'react-native';
import { formatMinor } from '@worn/shared';

import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Button } from '@/src/components/ui';
import { ClosetScreen } from '@/src/components/ClosetScreen';
import { ClosetVirtualList } from '@/src/components/ClosetVirtualList';
import {
  useCorrectIngestionDocument,
  useIngestionActivity,
  useIngestionMetrics,
  useIngestionSources,
  useMergePurchases,
  useMuteMerchant,
  usePurchases,
  useSplitPurchase,
} from '@/src/hooks/closet/useCloset';
import { createIngestionSource } from '@/src/api/client';
import { FEATURE_CLOSET } from '@/src/lib/features';
import { useClosetPrefsStore } from '@/src/lib/closetPrefs';
import { CLOSET_OFF_SUBTITLE, closetAlertText } from '@/src/lib/closetScreenState';
import { toAccountHealthRow } from '@/src/lib/accountHealth';
import { trackEvent } from '@/src/lib/analytics';
import {
  buildInlineFixBody,
  draftFromActivityItem,
} from '@/src/lib/fixParseInline';
import { reconnectButtonLabel, startGmailReconnect } from '@/src/lib/healthReconnect';
import {
  activityRowIsBodySafe,
  shouldOpenSyncFeed,
} from '@/src/lib/syncFeedAfter';
import { useSessionStore } from '@/src/stores/session';
import {
  border,
  fontSans,
  fsBody,
  fsCaption,
  radiusMd,
  space3,
  space4,
  surface,
  text,
  textMuted,
} from '@/src/theme/tokens';
import type { ClosetPurchaseWithItems, IngestionActivityItem } from '@/src/api/client';

WebBrowser.maybeCompleteAuthSession();

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function DictCard({ title, dict }: { title: string; dict: Record<string, number> }) {
  const entries = Object.entries(dict);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {entries.length === 0 ? (
        <Text style={styles.muted}>No data</Text>
      ) : (
        entries.map(([k, v]) => <StatRow key={k} label={k} value={String(v)} />)
      )}
    </View>
  );
}

function MerchantMuteCard({
  dict,
  muted,
  onMute,
  busy,
}: {
  dict: Record<string, number>;
  muted: Set<string>;
  onMute: (merchant: string) => void;
  busy: boolean;
}) {
  const entries = Object.entries(dict);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>By merchant</Text>
      <Text style={styles.note}>Mute food/OTP senders — we skip them on future syncs.</Text>
      {entries.length === 0 ? (
        <Text style={styles.muted}>No data</Text>
      ) : (
        entries.map(([merchant, count]) => {
          const isMuted = muted.has(merchant.trim().toUpperCase());
          return (
            <View key={merchant} style={styles.merchantRow}>
              <View style={styles.activityMain}>
                <Text style={styles.statLabel}>{merchant}</Text>
                <Text style={styles.muted}>{count} · {isMuted ? 'muted' : 'active'}</Text>
              </View>
              <Pressable
                onPress={() => onMute(merchant)}
                hitSlop={8}
                disabled={busy || isMuted}
              >
                <Text style={[styles.fixLink, (busy || isMuted) && styles.fixLinkDisabled]}>
                  {isMuted ? 'Muted' : 'Mute'}
                </Text>
              </Pressable>
            </View>
          );
        })
      )}
    </View>
  );
}

function ActivityRow({
  item,
  onFix,
  onMute,
  muted,
  editing,
  draftMerchant,
  draftTotal,
  fixError,
  fixBusy,
  onChangeMerchant,
  onChangeTotal,
  onSave,
  onCancel,
}: {
  item: IngestionActivityItem;
  onFix: (item: IngestionActivityItem) => void;
  onMute: (merchant: string) => void;
  muted: Set<string>;
  editing: boolean;
  draftMerchant: string;
  draftTotal: string;
  fixError: string | null;
  fixBusy: boolean;
  onChangeMerchant: (v: string) => void;
  onChangeTotal: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const total =
    item.totalMinor != null && item.currency
      ? formatMinor(item.totalMinor, item.currency)
      : item.totalMinor != null
        ? String(item.totalMinor)
        : '—';
  const merchant = item.merchant?.trim() ?? '';
  const isMuted = merchant ? muted.has(merchant.toUpperCase()) : false;

  if (editing) {
    return (
      <View style={styles.activityRowEdit}>
        <Text style={styles.activityMerchant}>{item.merchant ?? 'Unknown merchant'}</Text>
        <Text style={styles.activitySubject} numberOfLines={1}>
          {item.subject ?? item.snippet ?? item.status}
        </Text>
        <Text style={styles.fieldLabel}>Merchant</Text>
        <TextInput
          style={styles.input}
          value={draftMerchant}
          onChangeText={onChangeMerchant}
          placeholder="Merchant"
          placeholderTextColor={textMuted}
          autoCapitalize="words"
        />
        <Text style={styles.fieldLabel}>Total (major units)</Text>
        <TextInput
          style={styles.input}
          value={draftTotal}
          onChangeText={onChangeTotal}
          placeholder="499.00"
          placeholderTextColor={textMuted}
          keyboardType="decimal-pad"
        />
        {fixError ? <Text style={styles.error}>{fixError}</Text> : null}
        <View style={styles.fixActions}>
          <Button label="Cancel" variant="ghost" onPress={onCancel} disabled={fixBusy} />
          <Button
            label={fixBusy ? 'Saving…' : 'Save correction'}
            variant="primary"
            onPress={onSave}
            disabled={fixBusy}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.activityRow}>
      <View style={styles.activityMain}>
        <Text style={styles.activityMerchant}>{item.merchant ?? 'Unknown merchant'}</Text>
        <Text style={styles.activitySubject} numberOfLines={1}>
          {item.subject ?? item.snippet ?? item.status}
        </Text>
        <Text style={styles.muted}>
          {total} · {item.status}
          {isMuted ? ' · muted' : ''}
        </Text>
      </View>
      {merchant && !isMuted ? (
        <Pressable onPress={() => onMute(merchant)} hitSlop={8}>
          <Text style={styles.fixLink}>Mute</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={() => onFix(item)} hitSlop={8}>
        <Text style={styles.fixLink}>Fix</Text>
      </Pressable>
    </View>
  );
}

function PurchaseTrustCard({
  rows,
  loading,
  selected,
  onToggle,
  onMerge,
  splitPurchaseId,
  splitItemIds,
  onStartSplit,
  onToggleSplitItem,
  onConfirmSplit,
  onCancelSplit,
  mergeBusy,
  splitBusy,
  note,
}: {
  rows: ClosetPurchaseWithItems[];
  loading?: boolean;
  selected: string[];
  onToggle: (id: string) => void;
  onMerge: () => void;
  splitPurchaseId: string | null;
  splitItemIds: string[];
  onStartSplit: (id: string) => void;
  onToggleSplitItem: (itemId: string) => void;
  onConfirmSplit: () => void;
  onCancelSplit: () => void;
  mergeBusy: boolean;
  splitBusy: boolean;
  note: string | null;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Purchases — merge / split</Text>
      <Text style={styles.note}>
        Fix double parses (merge) or multi-item orders (split). Totals stay in sync with line items.
      </Text>
      {loading ? <Text style={styles.muted}>Loading purchases…</Text> : null}
      {!loading && rows.length === 0 ? <Text style={styles.muted}>No purchases yet.</Text> : null}
      {rows.slice(0, 12).map(({ purchase, items }) => {
        const isSelected = selected.includes(purchase.id);
        const splitting = splitPurchaseId === purchase.id;
        return (
          <View key={purchase.id} style={styles.purchaseBlock}>
            <Pressable style={styles.merchantRow} onPress={() => onToggle(purchase.id)}>
              <Text style={styles.statValue}>{isSelected ? '✓' : '○'}</Text>
              <View style={styles.activityMain}>
                <Text style={styles.activityMerchant} numberOfLines={1}>
                  {purchase.merchant}
                </Text>
                <Text style={styles.muted}>
                  {formatMinor(purchase.totalMinor, purchase.currency)} · {items.length} item
                  {items.length === 1 ? '' : 's'}
                </Text>
              </View>
              {items.length > 1 && !splitting ? (
                <Pressable onPress={() => onStartSplit(purchase.id)} hitSlop={8}>
                  <Text style={styles.fixLink}>Split</Text>
                </Pressable>
              ) : null}
            </Pressable>
            {splitting ? (
              <View style={styles.splitBox}>
                <Text style={styles.note}>Select items to move to a new purchase (keep ≥1).</Text>
                {items.map((it) => {
                  const on = splitItemIds.includes(it.id);
                  return (
                    <Pressable
                      key={it.id}
                      style={styles.merchantRow}
                      onPress={() => onToggleSplitItem(it.id)}
                    >
                      <Text style={styles.statValue}>{on ? '✓' : '○'}</Text>
                      <Text style={styles.muted} numberOfLines={1}>
                        {it.title} · {formatMinor(it.priceMinor * it.qty, purchase.currency)}
                      </Text>
                    </Pressable>
                  );
                })}
                <View style={styles.fixActions}>
                  <Button label="Cancel" variant="ghost" onPress={onCancelSplit} disabled={splitBusy} />
                  <Button
                    label={splitBusy ? 'Splitting…' : 'Split selected'}
                    variant="primary"
                    onPress={onConfirmSplit}
                    disabled={splitBusy || splitItemIds.length === 0}
                  />
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
      {selected.length === 2 ? (
        <Button
          label={mergeBusy ? 'Merging…' : 'Merge selected into first'}
          variant="primary"
          onPress={onMerge}
          disabled={mergeBusy}
        />
      ) : (
        <Text style={styles.note}>Select exactly two purchases to merge.</Text>
      )}
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

export default function ClosetMetricsScreen() {
  const params = useLocalSearchParams<{ focus?: string }>();
  const accessToken = useSessionStore((s) => s.accessToken);
  const currency = useClosetPrefsStore((s) => s.preferredCurrency);
  const openFeed = shouldOpenSyncFeed(params);
  const { data, isLoading, isError, error, refetch } = useIngestionMetrics();
  const activity = useIngestionActivity();
  const sources = useIngestionSources();
  const purchases = usePurchases();
  const correct = useCorrectIngestionDocument();
  const mute = useMuteMerchant();
  const mergeMut = useMergePurchases();
  const splitMut = useSplitPurchase();
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [fixMerchant, setFixMerchant] = useState('');
  const [fixTotal, setFixTotal] = useState('');
  const [fixError, setFixError] = useState<string | null>(null);
  const [muteNote, setMuteNote] = useState<string | null>(null);
  const [selectedPurchaseIds, setSelectedPurchaseIds] = useState<string[]>([]);
  const [splitPurchaseId, setSplitPurchaseId] = useState<string | null>(null);
  const [splitItemIds, setSplitItemIds] = useState<string[]>([]);
  const [purchaseNote, setPurchaseNote] = useState<string | null>(null);
  const [reconnectBusy, setReconnectBusy] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const feedRef = useRef<View>(null);
  const scrolledToFeed = useRef(false);
  const trackedFeedOpen = useRef(false);

  const refetchActivity = activity.refetch;
  const refetchSources = sources.refetch;
  const refetchPurchases = purchases.refetch;
  const onRefresh = useCallback(async () => {
    await Promise.all([refetch(), refetchActivity(), refetchSources(), refetchPurchases()]);
  }, [refetch, refetchActivity, refetchSources, refetchPurchases]);

  const sourceRows = sources.data?.sources;
  const muted = useMemo(() => {
    const set = new Set<string>();
    for (const s of sourceRows ?? []) {
      const list = (s.meta as { mutedMerchants?: string[] } | null | undefined)?.mutedMerchants;
      for (const m of list ?? []) set.add(m.trim().toUpperCase());
    }
    return set;
  }, [sourceRows]);

  const healthRows = useMemo(() => (sourceRows ?? []).map((s) => toAccountHealthRow(s)), [sourceRows]);

  const safeActivityItems = useMemo(
    () => (activity.data?.items ?? []).filter((item) => activityRowIsBodySafe(item)),
    [activity.data?.items],
  );

  useEffect(() => {
    if (data) trackEvent('metrics_viewed' as never, { totalMessages: data.totalMessages });
  }, [data]);

  useEffect(() => {
    if (!openFeed || trackedFeedOpen.current) return;
    trackedFeedOpen.current = true;
    trackEvent('ingestion_activity_viewed' as never, { source: 'sync_feed_after' });
  }, [openFeed]);

  const aboveFeedLoading = isLoading || sources.isLoading || purchases.isLoading;
  // After a sync, bring "What we read" into view once the cards above it have their final height.
  // The card moves when they load, and each move fires onLayout again.
  function onFeedLayout() {
    if (!openFeed || scrolledToFeed.current || aboveFeedLoading) return;
    const content = scrollRef.current?.getInnerViewNode?.();
    if (!content || !feedRef.current) return;
    feedRef.current.measureLayout(
      content,
      (_x, y) => {
        scrolledToFeed.current = true;
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
      },
      () => undefined,
    );
  }

  if (!FEATURE_CLOSET) {
    return (
      <ClosetScreen title="Ingestion metrics" subtitle={CLOSET_OFF_SUBTITLE} />
    );
  }

  async function submitFix(item: IngestionActivityItem) {
    setFixError(null);
    const built = buildInlineFixBody({
      merchant: fixMerchant,
      totalMajor: fixTotal,
      currency: item.currency ?? currency,
    });
    if (!built.ok) {
      setFixError(built.error);
      return;
    }
    try {
      await correct.mutateAsync({
        documentId: item.id,
        body: built.body,
      });
      setFixingId(null);
      setFixTotal('');
      setFixMerchant('');
    } catch (e) {
      setFixError(closetAlertText(e));
    }
  }

  async function onMute(merchant: string) {
    setMuteNote(null);
    try {
      await mute.mutateAsync(merchant);
      setMuteNote(`Muted ${merchant} — skipped on future syncs.`);
    } catch (e) {
      setMuteNote(closetAlertText(e));
    }
  }

  function togglePurchase(id: string) {
    setSelectedPurchaseIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1]!, id];
      return [...prev, id];
    });
  }

  async function onMerge() {
    if (selectedPurchaseIds.length !== 2) return;
    setPurchaseNote(null);
    const [targetPurchaseId, sourcePurchaseId] = selectedPurchaseIds;
    try {
      await mergeMut.mutateAsync({
        targetPurchaseId: targetPurchaseId!,
        sourcePurchaseId: sourcePurchaseId!,
      });
      setSelectedPurchaseIds([]);
      setPurchaseNote('Merged — duplicate marked and items combined.');
    } catch (e) {
      setPurchaseNote(closetAlertText(e));
    }
  }

  async function onConfirmSplit() {
    if (!splitPurchaseId || splitItemIds.length === 0) return;
    setPurchaseNote(null);
    try {
      await splitMut.mutateAsync({ purchaseId: splitPurchaseId, itemIds: splitItemIds });
      setSplitPurchaseId(null);
      setSplitItemIds([]);
      setPurchaseNote('Split — items moved to a new purchase.');
    } catch (e) {
      setPurchaseNote(closetAlertText(e));
    }
  }

  async function reconnectAccount() {
    if (!accessToken) {
      setReconnectError('Sign in to reconnect.');
      return;
    }
    setReconnectBusy(true);
    setReconnectError(null);
    try {
      const result = await startGmailReconnect({
        accessToken,
        createSource: createIngestionSource,
        openBrowser: (url) => WebBrowser.openBrowserAsync(url),
      });
      if (result.status === 'cancelled') {
        setReconnectError('OAuth was cancelled. Try again when you are ready.');
        return;
      }
      if (result.status === 'error') {
        setReconnectError(result.message);
        return;
      }
      await sources.refetch();
    } finally {
      setReconnectBusy(false);
    }
  }

  return (
    <ClosetScreen
      title="Ingestion metrics"
      subtitle="Coverage and what we read — fix wrong totals here."
      scrollRef={scrollRef}
      onRefresh={onRefresh}
    >
      {isLoading ? <Text style={styles.muted}>Loading…</Text> : null}
      {isError ? <Text style={styles.muted}>Could not load metrics: {closetAlertText(error)}</Text> : null}
      <View style={styles.list}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Connected accounts</Text>
          <Text style={styles.note}>
            Token, last sync, and errors — reconnect when inbox magic fails.
          </Text>
          {sources.isLoading ? <Text style={styles.muted}>Loading accounts…</Text> : null}
          {healthRows.length === 0 && !sources.isLoading ? (
            <Text style={styles.muted}>No sources connected yet.</Text>
          ) : null}
          {healthRows.map((row) => (
            <View key={row.id} style={styles.healthRow}>
              <View style={styles.activityMain}>
                <Text style={styles.activityMerchant}>
                  {row.provider} · {row.sourceKind}
                </Text>
                <Text style={styles.muted}>
                  {row.label} · {row.status} · Last sync {row.lastSyncLabel}
                </Text>
                {row.error ? <Text style={styles.error}>{row.error}</Text> : null}
              </View>
              {row.needsReconnect ? (
                <Pressable
                  onPress={() => void reconnectAccount()}
                  hitSlop={8}
                  disabled={reconnectBusy || !accessToken}
                >
                  <Text style={styles.fixLink}>{reconnectButtonLabel(reconnectBusy)}</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
          {reconnectError ? <Text style={styles.error}>{reconnectError}</Text> : null}
        </View>

        {data ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Overview</Text>
              <StatRow label="Total messages" value={String(data.totalMessages)} />
              <StatRow label="Specific hits" value={String(data.specificHits)} />
              <StatRow label="Generic hits" value={String(data.genericHits)} />
              <StatRow label="Misses" value={String(data.misses)} />
              <StatRow label="Coverage" value={`${(data.coverage * 100).toFixed(2)}%`} />
            </View>

            <DictCard title="By status" dict={data.byStatus} />
            <DictCard title="By kind" dict={data.byKind} />
            <MerchantMuteCard
              dict={data.byMerchant}
              muted={muted}
              onMute={(m) => void onMute(m)}
              busy={mute.isPending}
            />
            {muteNote ? <Text style={styles.note}>{muteNote}</Text> : null}

            {/* A parse-only estimate for the team: not a cost anyone pays. */}
            {__DEV__ ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Cost estimate</Text>
              <StatRow
                label="Per message"
                value={formatMinor(data.costEstimate.perMessageMinor, data.costEstimate.currency)}
              />
              <StatRow
                label="Estimated total"
                value={formatMinor(data.costEstimate.estimatedTotalMinor, data.costEstimate.currency)}
              />
              <Text style={styles.note}>{data.note}</Text>
            </View>
            ) : null}
          </>
        ) : null}

        <PurchaseTrustCard
          rows={purchases.data?.purchases ?? []}
          loading={purchases.isLoading}
          selected={selectedPurchaseIds}
          onToggle={togglePurchase}
          onMerge={() => void onMerge()}
          splitPurchaseId={splitPurchaseId}
          splitItemIds={splitItemIds}
          onStartSplit={(id) => {
            setSplitPurchaseId(id);
            setSplitItemIds([]);
            setPurchaseNote(null);
          }}
          onToggleSplitItem={(itemId) => {
            setSplitItemIds((prev) =>
              prev.includes(itemId) ? prev.filter((x) => x !== itemId) : [...prev, itemId],
            );
          }}
          onConfirmSplit={() => void onConfirmSplit()}
          onCancelSplit={() => {
            setSplitPurchaseId(null);
            setSplitItemIds([]);
          }}
          mergeBusy={mergeMut.isPending}
          splitBusy={splitMut.isPending}
          note={purchaseNote}
        />

        <View
          ref={feedRef}
          style={[styles.card, openFeed ? styles.feedHighlight : null]}
          onLayout={onFeedLayout}
        >
          <Text style={styles.cardTitle}>What we read</Text>
          <Text style={styles.note}>
            Recent parses only — never the full email body. Tap Fix if a total looks wrong.
          </Text>
          {openFeed ? (
            <Text style={styles.feedBanner}>Just synced — here&apos;s what we read.</Text>
          ) : null}
          {activity.isLoading ? (
            <View style={styles.feedLoading}>
              <ActivityIndicator />
              <Text style={styles.muted}>Loading reads…</Text>
            </View>
          ) : null}
          {activity.isError ? (
            <Text style={styles.muted}>
              Could not load activity. Grant email consent to see what we read.
            </Text>
          ) : null}
          {safeActivityItems.length === 0 && !activity.isLoading ? (
            <Text style={styles.muted}>No documents yet.</Text>
          ) : null}
          <ClosetVirtualList
            data={safeActivityItems}
            keyExtractor={(item) => item.id}
            testID="metrics-activity-list"
            renderItem={({ item }) => (
              <ActivityRow
                item={item}
                muted={muted}
                editing={fixingId === item.id}
                draftMerchant={fixMerchant}
                draftTotal={fixTotal}
                fixError={fixingId === item.id ? fixError : null}
                fixBusy={correct.isPending && fixingId === item.id}
                onChangeMerchant={setFixMerchant}
                onChangeTotal={setFixTotal}
                onMute={(m) => void onMute(m)}
                onFix={(row) => {
                  const draft = draftFromActivityItem(row);
                  setFixingId(row.id);
                  setFixMerchant(draft.merchant);
                  setFixTotal(draft.totalMajor);
                  setFixError(null);
                }}
                onSave={() => void submitFix(item)}
                onCancel={() => {
                  setFixingId(null);
                  setFixError(null);
                }}
              />
            )}
          />
        </View>
      </View>
    </ClosetScreen>
  );
}

const styles = StyleSheet.create({
  activityMain: { flex: 1, gap: 2 },
  activityMerchant: { color: text, fontFamily: fontSans, fontSize: fsBody, fontWeight: '600' },
  activityRow: {
    borderTopColor: border,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space3,
    paddingVertical: space3,
  },
  activityRowEdit: {
    borderTopColor: border,
    borderTopWidth: 1,
    gap: 2,
    paddingVertical: space3,
  },
  activitySubject: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption },
  card: { backgroundColor: surface, borderColor: border, borderRadius: radiusMd, borderWidth: 1, padding: space4 },
  cardTitle: { color: text, fontFamily: fontSans, fontSize: fsBody, fontWeight: '700', marginBottom: space4 },
  error: { color: '#b3261e', fontFamily: fontSans, fontSize: fsCaption, marginTop: space3 },
  feedBanner: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '600',
    marginBottom: space3,
  },
  feedHighlight: { borderColor: text, borderWidth: 2 },
  feedLoading: { alignItems: 'center', flexDirection: 'row', gap: space3 },
  fieldLabel: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption, marginTop: space3 },
  fixActions: { flexDirection: 'row', gap: space3, marginTop: space4, justifyContent: 'flex-end' },
  fixLink: { color: text, fontFamily: fontSans, fontSize: fsCaption, fontWeight: '700' },
  fixLinkDisabled: { color: textMuted, fontWeight: '500' },
  healthRow: {
    borderTopColor: border,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space3,
    paddingVertical: space3,
  },
  input: {
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    marginTop: 6,
    paddingHorizontal: space3,
    paddingVertical: space3,
  },
  list: { gap: space4 },
  merchantRow: {
    borderTopColor: border,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space3,
    paddingVertical: space3,
  },
  muted: { color: textMuted, fontFamily: fontSans, fontSize: fsBody },
  note: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption, marginBottom: space3, marginTop: space3 },
  purchaseBlock: { borderTopColor: border, borderTopWidth: 1 },
  splitBox: { paddingBottom: space3, paddingLeft: space3 },
  statLabel: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption, flex: 1 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: space4 },
  statValue: { color: text, fontFamily: fontSans, fontSize: fsBody, fontWeight: '600' },
});

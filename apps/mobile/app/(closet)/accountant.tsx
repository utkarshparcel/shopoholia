import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatMinor, matchesRefundDestinationFilter, type RefundDestination } from '@worn/shared';
import { Button } from '@/src/components/ui';
import { ClosetScreen } from '@/src/components/ClosetScreen';
import { ClosetVirtualList } from '@/src/components/ClosetVirtualList';
import {
  useAccountantLedger,
  useAccountantSeasonRoi,
  useAccountantSummary,
  useBudgets,
  useCreateBudget,
  useExportAccountantCsv,
} from '@/src/hooks/closet/useCloset';
import { trackEvent } from '@/src/lib/analytics';
import { emptyStateCopy } from '@/src/lib/emptyDemo';
import { PremiumGate } from '@/src/components/PremiumGate';
import { EmiDontMissCards } from '@/src/components/EmiDontMissCards';
import { RepairSpendChip } from '@/src/components/RepairSpendChip';
import { FEATURE_CLOSET } from '@/src/lib/features';
import { cpwGoalNudgeCopy } from '@/src/lib/cpwGoals';
import { formatClosetDate } from '@/src/lib/format';
import { bg, border, fontSans, fsBody, fsCaption, radiusMd, space4, space6, surface, text, textMuted } from '@/src/theme/tokens';

const CATEGORIES = ['APPAREL', 'FOOTWEAR', 'ACCESSORIES', 'BEAUTY', 'GENERAL'] as const;
const PERIODS = ['MONTHLY', 'QUARTERLY'] as const;

export default function ClosetAccountantScreen() {
  const params = useLocalSearchParams<{ focus?: string; plan?: string }>();
  const router = useRouter();
  const emiFocus = params.focus === 'emi';
  const repairsFocus = params.focus === 'repairs';
  const [refundDestFilter, setRefundDestFilter] = useState<
    RefundDestination | 'ALL'
  >('ALL');
  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    error: summaryErr,
    refetch: refetchSummary,
    isRefetching: summaryRefetching,
  } = useAccountantSummary();
  const {
    data: seasonRoi,
    refetch: refetchSeasonRoi,
    isRefetching: seasonRoiRefetching,
  } = useAccountantSeasonRoi();
  const {
    data: ledger,
    isLoading: ledgerLoading,
    isError: ledgerError,
    error: ledgerErr,
    refetch: refetchLedger,
    isRefetching: ledgerRefetching,
  } = useAccountantLedger();
  const {
    data: budgetsData,
    refetch: refetchBudgets,
    isRefetching: budgetsRefetching,
  } = useBudgets();
  const createBudget = useCreateBudget();
  const exportCsv = useExportAccountantCsv();

  const [category, setCategory] = useState('GENERAL');
  const [period, setPeriod] = useState('MONTHLY');
  const [limit, setLimit] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [showRepairsOnly, setShowRepairsOnly] = useState(repairsFocus);

  useEffect(() => { trackEvent('accountant_viewed'); }, []);
  useEffect(() => { if (ledger) trackEvent('ledger_viewed'); }, [ledger]);
  useEffect(() => {
    if (seasonRoi) trackEvent('accountant_roi_season_viewed', { year: seasonRoi.year });
  }, [seasonRoi]);
  useEffect(() => {
    if (repairsFocus) setShowRepairsOnly(true);
  }, [repairsFocus]);

  const ledgerEntries = useMemo(() => {
    const entries = ledger?.entries ?? [];
    let next = entries;
    if (showRepairsOnly) next = next.filter((e) => e.kind === 'REPAIR');
    if (refundDestFilter !== 'ALL') {
      next = next.filter((e) =>
        matchesRefundDestinationFilter(
          e.refType ?? e.description,
          refundDestFilter,
        ),
      );
    }
    return next;
  }, [ledger?.entries, showRepairsOnly, refundDestFilter]);

  const onRefresh = useCallback(() => {
    void Promise.all([refetchSummary(), refetchLedger(), refetchBudgets(), refetchSeasonRoi()]);
  }, [refetchSummary, refetchLedger, refetchBudgets, refetchSeasonRoi]);

  if (!FEATURE_CLOSET) {
    return (
      <ClosetScreen
        title="Accountant"
        subtitle="Enable EXPO_PUBLIC_FEATURE_CLOSET=1 to view spend and budgets."
      />
    );
  }

  const isLoading = summaryLoading || ledgerLoading;
  const isError = summaryError || ledgerError;
  const errorMessage =
    (summaryErr as Error | undefined)?.message ??
    (ledgerErr as Error | undefined)?.message ??
    true;
  const hasSpend = (summary?.totalSpendMinor ?? 0) > 0 || (summary?.spendByCategory?.length ?? 0) > 0;
  const hasLedger = (ledger?.entries?.length ?? 0) > 0;
  const hasBudgets = (budgetsData?.budgets?.length ?? 0) > 0 || (summary?.budgets?.length ?? 0) > 0;
  const hasSeasonRoi = (seasonRoi?.seasons?.length ?? 0) > 0;
  const hasCpwGoals = (summary?.cpwGoals?.length ?? 0) > 0;
  const hasContent = hasSpend || hasLedger || hasBudgets || hasSeasonRoi || hasCpwGoals;
  const isEmpty = !isLoading && !isError && !hasContent;

  const exceeded = summary?.budgets?.filter((b) => b.exceeded) ?? [];
  const envelopeWarn = summary?.budgets?.filter((b) => b.envelopeStatus === "WARN") ?? [];

  function submitBudget() {
    const limitMinor = Math.round(Number(limit) * 100);
    if (!CATEGORIES.includes(category as never) || !PERIODS.includes(period as never) || !Number.isFinite(limitMinor) || limitMinor <= 0) {
      Alert.alert('Enter a valid category, period and limit');
      return;
    }
    createBudget.mutate({ category, period, limitMinor }, {
      onSuccess: () => setLimit(''),
      onError: (e) => Alert.alert('Could not create budget', (e as Error).message),
    });
  }

  function onExportCsv() {
    setExportError(null);
    setExportNote(null);
    exportCsv.mutate(undefined, {
      onSuccess: (result) => {
        if (!result.shared) {
          setExportNote(`Saved locally at ${result.uri}`);
        }
      },
      onError: (e) => setExportError((e as Error).message),
    });
  }

  const budgetForm = (
    <View style={styles.form}>
      <Text style={styles.cardLabel}>Add budget</Text>
      <TextInput style={styles.input} placeholder="Category (APPAREL, GENERAL…)" placeholderTextColor={textMuted} value={category} onChangeText={setCategory} autoCapitalize="characters" />
      <TextInput style={styles.input} placeholder="Period (MONTHLY or QUARTERLY)" placeholderTextColor={textMuted} value={period} onChangeText={setPeriod} autoCapitalize="characters" />
      <TextInput style={styles.input} placeholder="Limit (₹)" placeholderTextColor={textMuted} keyboardType="decimal-pad" value={limit} onChangeText={setLimit} />
      <Button label="Save budget" block disabled={createBudget.isPending} onPress={submitBudget} />
    </View>
  );

  return (
    <ClosetScreen
      title="Accountant"
      subtitle="True cost per wear, resale value, and the lifetime of every item."
      loading={isLoading}
      loadingLabel="Loading your spend…"
      hasContent={hasContent}
      error={isError ? errorMessage : null}
      onRetry={onRefresh}
      empty={isEmpty}
      emptyTitle="No spend yet"
      emptyMessage="Snap receipts or connect your inbox — wardrobe and vault purchases show up here."
      emptyAction={budgetForm}
      onRefresh={onRefresh}
      refreshing={summaryRefetching || ledgerRefetching || budgetsRefetching || seasonRoiRefetching}
      skeletonRows={5}
    >
      <PremiumGate surface="accountant">
      <View>
        {emiFocus ? (
          <Text style={styles.sectionTitle} accessibilityRole="header">
            EMI due soon{params.plan ? ` · plan` : ''}
          </Text>
        ) : null}
        <EmiDontMissCards highlightPlanId={params.plan} />
        {exceeded.length > 0 ? (
          <View style={styles.nudge}>
            <Text style={styles.nudgeText}>
              Budget exceeded for {exceeded.map((b) => b.category).join(', ')} — Play checkout shows a soft spend-awareness nudge.
            </Text>
          </View>
        ) : envelopeWarn.length > 0 ? (
          <View style={styles.nudge}>
            <Text style={styles.nudgeText}>
              Mid-period alert: {envelopeWarn.map((b) => b.category).join(', ')} at 80%+ of envelope — slow the haul before the cap.
            </Text>
          </View>
        ) : null}

        <View style={styles.banner}>
          <Text style={styles.bannerLabel}>Closet P&L · {summary?.monthLabel ?? '—'}</Text>
          <Text style={styles.bannerValue}>{summary ? formatMinor(summary.totalSpendMinor) : '—'}</Text>
          <Text style={styles.bannerSub}>
            {summary
              ? `This month ${formatMinor(summary.monthlySpendMinor)} · ${summary.spendByCategory.length} categories`
              : 'No purchases yet'}
          </Text>
          <RepairSpendChip
            repairSpendMinor={summary?.repairSpendMinor}
            monthlyRepairSpendMinor={summary?.monthlyRepairSpendMinor}
            active={showRepairsOnly}
            onPress={() => {
              setShowRepairsOnly(true);
              router.setParams({ focus: 'repairs' });
            }}
          />
        </View>

        <Text style={styles.sectionTitle}>ROI by season · {seasonRoi?.year ?? '—'}</Text>
        {seasonRoi?.seasons?.length ? seasonRoi.seasons.map((s) => (
          <View key={s.season} style={styles.card}>
            <Text style={styles.merchant}>{s.label}</Text>
            <Text style={styles.balance}>
              {s.wears} wears · worn {formatMinor(s.costWornMinor)} · idle {formatMinor(s.costIdleMinor)}
            </Text>
            <Text style={styles.expiry}>
              {s.itemsWorn} worn · {s.itemsIdle} idle
              {s.costPerWearMinor != null ? ` · ${formatMinor(s.costPerWearMinor)}/wear` : ''}
            </Text>
          </View>
        )) : <Text style={styles.muted}>Wear items to see seasonal ROI.</Text>}

        <Button
          label={exportCsv.isPending ? 'Exporting…' : 'Export CSV'}
          block
          variant="secondary"
          disabled={exportCsv.isPending}
          onPress={onExportCsv}
        />
        {exportNote ? <Text style={styles.muted}>{exportNote}</Text> : null}
        {exportError ? <Text style={styles.exportError}>{exportError}</Text> : null}

        <View style={[styles.row, { marginTop: space4 }]}>
          <View style={[styles.card, styles.cardHalf]}>
            <Text style={styles.cardLabel}>Cost per wear</Text>
            <Text style={styles.cardValue}>
              {(summary?.costPerWearMinor ?? summary?.avgCostPerWearMinor) != null
                ? formatMinor(summary?.costPerWearMinor ?? summary!.avgCostPerWearMinor!)
                : '—'}
            </Text>
          </View>
          <View style={[styles.card, styles.cardHalf]}>
            <Text style={styles.cardLabel}>Budgets</Text>
            <Text style={styles.cardValue}>{budgetsData?.budgets?.length ?? summary?.budgets?.length ?? 0}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Spend by category</Text>
        {summary?.spendByCategory?.length ? summary.spendByCategory.map((r) => (
          <View key={r.category} style={styles.card}>
            <Text style={styles.merchant}>{r.category}</Text>
            <Text style={styles.balance}>{formatMinor(r.totalMinor)}</Text>
          </View>
        )) : <Text style={styles.muted}>No spend yet</Text>}

        <Text style={styles.sectionTitle}>Budgets</Text>
        {budgetsData?.budgets?.length ? budgetsData.budgets.map((b) => {
          const summaryB = summary?.budgets?.find((s) => s.category === b.category && s.period === b.period);
          return (
            <View key={b.id} style={styles.card}>
              <Text style={styles.merchant}>{b.category} · {b.period}</Text>
              <Text style={styles.balance}>Limit {formatMinor(b.limitMinor)}</Text>
              {summaryB ? (
                <Text
                  style={[
                    styles.expiry,
                    summaryB.exceeded && { color: '#b3261e' },
                    summaryB.envelopeStatus === 'WARN' && !summaryB.exceeded && { color: '#7a4a00' },
                  ]}
                >
                  Spent {formatMinor(summaryB.actualMinor)}
                  {summaryB.exceeded
                    ? ' · exceeded'
                    : summaryB.envelopeStatus === 'WARN'
                      ? ' · 80% envelope'
                      : ''}
                </Text>
              ) : null}
            </View>
          );
        }) : <Text style={styles.muted}>No budgets yet. Create one below.</Text>}

        {budgetForm}

        <Text style={styles.sectionTitle}>Cost-per-wear goals</Text>
        {summary?.cpwGoals?.length ? (
          summary.cpwGoals.map((g) => (
            <View key={g.wardrobeItemId} style={styles.card}>
              <Text style={styles.merchant}>
                {g.brand || g.category || 'Item'} · target{' '}
                {g.cpwGoal.targetCpwMinor != null ? formatMinor(g.cpwGoal.targetCpwMinor) : '—'}/wear
              </Text>
              <Text style={styles.balance}>{g.cpwGoal.label}</Text>
              <Text style={styles.expiry}>{cpwGoalNudgeCopy(g.cpwGoal, g.brand || g.category)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>Set a CPW goal from Wardrobe to nudge wears until target.</Text>
        )}

        <Text style={styles.sectionTitle}>
          Ledger{showRepairsOnly ? ' · repairs' : ''}
          {refundDestFilter !== 'ALL' ? ` · ${refundDestFilter}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {(['ALL', 'ORIGINAL_CARD', 'STORE_CREDIT', 'UPI'] as const).map((d) => (
            <Button
              key={d}
              label={d === 'ALL' ? 'All refunds' : d.replace('_', ' ')}
              size="sm"
              variant={refundDestFilter === d ? 'primary' : 'ghost'}
              onPress={() => setRefundDestFilter(d)}
            />
          ))}
        </View>
        {showRepairsOnly ? (
          <Button
            label="Show all ledger"
            size="sm"
            variant="ghost"
            onPress={() => {
              setShowRepairsOnly(false);
              router.setParams({ focus: undefined });
            }}
          />
        ) : null}
        <ClosetVirtualList
          data={ledgerEntries}
          keyExtractor={(e) => e.id}
          estimatedItemSize={88}
          ListEmptyComponent={<Text style={styles.muted}>{emptyStateCopy('accountant').message}</Text>}
          renderItem={({ item: e }) => (
            <View style={styles.card}>
              <Text style={styles.merchant}>{e.description}</Text>
              <Text style={[styles.balance, e.amountMinor < 0 && { color: '#b3261e' }]}>
                {formatMinor(e.amountMinor)}
              </Text>
              <Text style={styles.expiry}>
                {formatClosetDate(e.createdAt)} · {e.kind}
              </Text>
            </View>
          )}
        />
      </View>
      </PremiumGate>
    </ClosetScreen>
  );
}

const styles = StyleSheet.create({
  nudge: { backgroundColor: '#fff1d6', borderRadius: radiusMd, padding: space4, marginBottom: space4, borderWidth: 1, borderColor: '#ffd99e' },
  nudgeText: { color: '#7a4a00', fontFamily: fontSans, fontSize: fsCaption, fontWeight: '600' },
  banner: { backgroundColor: surface, borderColor: border, borderRadius: radiusMd, borderWidth: 1, marginBottom: space4, padding: space4 },
  bannerLabel: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption },
  bannerValue: { color: text, fontFamily: fontSans, fontSize: 28, fontWeight: '700' },
  bannerSub: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption, marginTop: 4 },
  row: { flexDirection: 'row', gap: space4, marginBottom: space4 },
  card: { backgroundColor: surface, borderColor: border, borderRadius: radiusMd, borderWidth: 1, marginBottom: space4, padding: space4 },
  cardHalf: { flex: 1 },
  cardLabel: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption },
  cardValue: { color: text, fontFamily: fontSans, fontSize: fsBody, fontWeight: '700', marginTop: 4 },
  sectionTitle: { color: text, fontFamily: fontSans, fontSize: fsBody, fontWeight: '700', marginTop: space6, marginBottom: space4 },
  muted: { color: textMuted, fontFamily: fontSans, fontSize: fsBody },
  exportError: { color: '#b3261e', fontFamily: fontSans, fontSize: fsCaption, marginTop: 4 },
  merchant: { color: text, fontFamily: fontSans, fontSize: fsBody, fontWeight: '600' },
  balance: { color: text, fontFamily: fontSans, fontSize: fsBody, fontWeight: '600', marginTop: 2 },
  expiry: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption, marginTop: 2 },
  form: { gap: space4, marginTop: space4 },
  input: { backgroundColor: bg, borderColor: border, borderRadius: radiusMd, borderWidth: 1, color: text, fontFamily: fontSans, fontSize: fsBody, paddingHorizontal: 12, paddingVertical: 10 },
});

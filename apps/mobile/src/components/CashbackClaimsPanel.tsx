import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/src/components/ui';
import {
  useCashbackClaims,
  useCreateCashbackClaim,
  useMarkCashbackClaimed,
} from '@/src/hooks/closet/useCloset';
import { trackEvent } from '@/src/lib/analytics';
import { parseAmountInput } from '@/src/lib/amountInput';
import { useClosetPrefsStore } from '@/src/lib/closetPrefs';
import { formatClosetDate, formatMinor } from '@/src/lib/format';
import { endOfDayKeyIso } from '@/src/lib/localDay';
import { closetAlertText } from '@/src/lib/closetScreenState';
import { cashbackClaimStartUrl } from '@worn/shared';
import {
  border,
  fontSans,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  radiusMd,
  space4,
  surface,
  text,
  textMuted,
} from '@/src/theme/tokens';

/** N14 / U006 — Vault cashback / reward claim queue (manual tracker, not a bank partner). */
export function CashbackClaimsPanel() {
  const claims = useCashbackClaims('UNCLAIMED');
  const create = useCreateCashbackClaim();
  const mark = useMarkCashbackClaimed();
  const currency = useClosetPrefsStore((s) => s.preferredCurrency);
  /** Rows with a "Claimed" request in flight, so each row has its own busy state. */
  const [markingIds, setMarkingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [source, setSource] = useState('');
  const [amount, setAmount] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [claimUrl, setClaimUrl] = useState('');
  const rows = claims.data?.claims ?? [];

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Unclaimed cashback</Text>
      <Text style={styles.sub}>
        Track card/bank fashion rewards until you claim them. Sorted by claim-before date.
      </Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Source (e.g. HDFC Swiggy)"
          placeholderTextColor={textMuted}
          value={source}
          onChangeText={setSource}
        />
        <TextInput
          style={styles.input}
          placeholder={`Amount in ${currency}`}
          placeholderTextColor={textMuted}
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />
        <TextInput
          style={styles.input}
          placeholder="Claim by (YYYY-MM-DD)"
          placeholderTextColor={textMuted}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          value={expiresAt}
          onChangeText={setExpiresAt}
        />
        <TextInput
          style={styles.input}
          placeholder="Claim portal URL (optional)"
          placeholderTextColor={textMuted}
          autoCapitalize="none"
          value={claimUrl}
          onChangeText={setClaimUrl}
        />
        <Button
          label={create.isPending ? 'Adding…' : 'Add claim'}
          size="sm"
          disabled={create.isPending}
          onPress={() => {
            const amountMinor = parseAmountInput(amount, currency);
            if (!source.trim() || amountMinor === null) {
              Alert.alert('Enter source and amount', `An amount in ${currency} above zero.`);
              return;
            }
            let expiresIso: string | undefined;
            if (expiresAt.trim()) {
              // The end of that day where the user is, not in UTC.
              const iso = endOfDayKeyIso(expiresAt);
              if (!iso) {
                Alert.alert('Use YYYY-MM-DD for claim-by date');
                return;
              }
              expiresIso = iso;
            }
            const url = claimUrl.trim();
            create.mutate(
              {
                source: source.trim(),
                amountMinor,
                currency,
                expiresAt: expiresIso,
                claimUrl: url || undefined,
              },
              {
                onSuccess: () => {
                  setSource('');
                  setAmount('');
                  setExpiresAt('');
                  setClaimUrl('');
                },
                onError: (e) => Alert.alert('Could not add the claim', closetAlertText(e)),
              },
            );
          }}
        />
      </View>

      {rows.length === 0 ? (
        <Text style={styles.empty}>No unclaimed rewards.</Text>
      ) : (
        rows.map((c) => {
          const startUrl = cashbackClaimStartUrl(c.source, c.claimUrl ?? null);
          // formatClosetDate shows "—" for a date it cannot read instead of throwing mid-render.
          const claimBy = c.expiresAt ? formatClosetDate(c.expiresAt) : null;
          const marking = markingIds.has(c.id);
          return (
            <View key={c.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{c.source}</Text>
                <Text style={styles.meta}>
                  {formatMinor(c.amountMinor, c.currency)}
                  {c.merchant ? ` · ${c.merchant}` : ''}
                  {claimBy ? ` · Claim by ${claimBy}` : ''}
                </Text>
              </View>
              <View style={styles.actions}>
                {startUrl ? (
                  <Button
                    label="Start claim"
                    size="sm"
                    onPress={() => {
                      trackEvent('cashback_claim_start', { claimId: c.id });
                      void Linking.openURL(startUrl).catch(() => undefined);
                    }}
                  />
                ) : null}
                <Button
                  label={marking ? 'Saving…' : 'Claimed'}
                  size="sm"
                  variant="secondary"
                  disabled={marking}
                  onPress={async () => {
                    setMarkingIds((prev) => new Set(prev).add(c.id));
                    try {
                      await mark.mutateAsync(c.id);
                    } catch (e) {
                      Alert.alert('Could not mark it claimed', closetAlertText(e));
                    } finally {
                      setMarkingIds((prev) => {
                        const next = new Set(prev);
                        next.delete(c.id);
                        return next;
                      });
                    }
                  }}
                />
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space4, marginTop: space4 },
  heading: { fontFamily: fontSansSemiBold, fontSize: fsBody, color: text },
  sub: { fontFamily: fontSans, fontSize: fsCaption, color: textMuted },
  form: { gap: space4, marginVertical: space4 },
  input: {
    borderWidth: 1,
    borderColor: border,
    borderRadius: radiusMd,
    paddingHorizontal: space4,
    paddingVertical: space4,
    color: text,
    backgroundColor: surface,
    fontFamily: fontSans,
  },
  empty: { fontFamily: fontSans, fontSize: fsCaption, color: textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space4,
    padding: space4,
    borderRadius: radiusMd,
    borderWidth: 1,
    borderColor: border,
    backgroundColor: surface,
    marginBottom: space4,
  },
  actions: { gap: space4, alignItems: 'flex-end' },
  title: { fontFamily: fontSans, fontSize: fsBody, color: text },
  meta: { fontFamily: fontSans, fontSize: fsCaption, color: textMuted, marginTop: 2 },
});

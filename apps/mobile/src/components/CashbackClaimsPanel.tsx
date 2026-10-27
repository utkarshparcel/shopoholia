import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/src/components/ui';
import {
  useCashbackClaims,
  useCreateCashbackClaim,
  useMarkCashbackClaimed,
} from '@/src/hooks/closet/useCloset';
import { trackEvent } from '@/src/lib/analytics';
import { formatMinor } from '@/src/lib/format';
import { cashbackClaimStartUrl } from '@worn/shared';
import {
  border,
  fontSans,
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
          placeholder="Amount (₹)"
          placeholderTextColor={textMuted}
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />
        <TextInput
          style={styles.input}
          placeholder="Claim by (YYYY-MM-DD)"
          placeholderTextColor={textMuted}
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
          label="Add claim"
          size="sm"
          onPress={() => {
            const rupees = Number.parseFloat(amount);
            if (!source.trim() || !Number.isFinite(rupees) || rupees <= 0) {
              Alert.alert('Enter source and amount');
              return;
            }
            let expiresIso: string | undefined;
            if (expiresAt.trim()) {
              const d = new Date(`${expiresAt.trim()}T23:59:59.000Z`);
              if (Number.isNaN(d.getTime())) {
                Alert.alert('Use YYYY-MM-DD for claim-by date');
                return;
              }
              expiresIso = d.toISOString();
            }
            const url = claimUrl.trim();
            create.mutate(
              {
                source: source.trim(),
                amountMinor: Math.round(rupees * 100),
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
          const claimBy = c.expiresAt
            ? new Date(c.expiresAt).toISOString().slice(0, 10)
            : null;
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
                  label="Claimed"
                  size="sm"
                  variant="secondary"
                  onPress={() => mark.mutate(c.id)}
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
  heading: { fontFamily: fontSans, fontSize: fsBody, color: text, fontWeight: '600' },
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

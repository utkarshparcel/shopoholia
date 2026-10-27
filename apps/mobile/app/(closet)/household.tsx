import { useMemo, useState } from 'react';
import {
  Alert,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  activeHouseholdSwitcherLabel,
  formatMinor,
  friendlyHouseholdAclCopy,
  friendlyHouseholdVaultAclCopy,
} from '@worn/shared';

import { Button } from '@/src/components/ui';
import { ClosetScreen } from '@/src/components/ClosetScreen';
import { usePrompt } from '@/src/components/PromptSheet';
import { laundryLabel } from '@/src/components/WardrobeItemCard';
import {
  useCreateHousehold,
  useHouseholdVault,
  useHouseholdWardrobe,
  useHouseholds,
  useJoinHousehold,
  usePatchHouseholdVaultMember,
  useSpendHouseholdVault,
} from '@/src/hooks/closet/useCloset';
import { parseAmountInput } from '@/src/lib/amountInput';
import { CLOSET_OFF_SUBTITLE, closetAlertText } from '@/src/lib/closetScreenState';
import { useClosetPrefsStore } from '@/src/lib/closetPrefs';
import { FEATURE_CLOSET } from '@/src/lib/features';
import { newIdempotencyKey } from '@/src/lib/idempotency';
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

/** Suggested spend cap when a member is first allowed to spend: 5,000 in the major unit. */
const DEFAULT_SPEND_CAP_MAJOR = '5000';

function accessLabel(access: 'VIEW' | 'SPEND' | undefined) {
  return access === 'SPEND' ? 'can spend' : 'view only';
}

export default function HouseholdScreen() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch } = useHouseholds();
  const create = useCreateHousehold();
  const join = useJoinHousehold();
  const [name, setName] = useState('Our home');
  const [code, setCode] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const wardrobe = useHouseholdWardrobe(activeId);
  const vault = useHouseholdVault(activeId);
  const patchVault = usePatchHouseholdVaultMember(activeId);
  const spendVault = useSpendHouseholdVault(activeId);
  const currency = useClosetPrefsStore((s) => s.preferredCurrency);
  const { ask, promptElement } = usePrompt();
  const households = data?.households ?? [];
  const activeHousehold = useMemo(
    () => households.find((x) => x.id === activeId) ?? null,
    [households, activeId],
  );
  const aclError = wardrobe.isError
    ? friendlyHouseholdAclCopy((wardrobe.error as Error)?.message)
    : null;
  const vaultAclError = vault.isError
    ? friendlyHouseholdVaultAclCopy((vault.error as Error)?.message)
    : null;

  if (!FEATURE_CLOSET) {
    return <ClosetScreen title="Household" subtitle={CLOSET_OFF_SUBTITLE} />;
  }

  const items = wardrobe.data?.items ?? [];
  const vaultAccounts = vault.data?.accounts ?? [];
  const vaultMembers = vault.data?.members ?? [];

  async function allowSpend(userId: string, label: string) {
    const values = await ask({
      title: `Let ${label} spend?`,
      message: 'They can mark shared credits as spent, up to this total.',
      fields: [
        {
          key: 'cap',
          label: `Spend cap in ${currency}`,
          defaultValue: DEFAULT_SPEND_CAP_MAJOR,
          keyboardType: 'decimal-pad',
        },
      ],
      confirmLabel: 'Allow spend',
      validate: (v) => (parseAmountInput(v.cap!, currency) ? null : 'Enter a cap above zero, for example 5000.'),
    });
    if (!values) return;
    patchVault.mutate(
      { userId, vaultAccess: 'SPEND', spendCapMinor: parseAmountInput(values.cap!, currency)! },
      {
        onError: (e) => Alert.alert('Could not update', friendlyHouseholdVaultAclCopy(closetAlertText(e))),
      },
    );
  }

  function makeViewOnly(userId: string, label: string) {
    Alert.alert(`Make ${label} view-only?`, 'They will still see balances but can’t mark credits spent.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Make view-only',
        onPress: () =>
          patchVault.mutate(
            { userId, vaultAccess: 'VIEW' },
            {
              onError: (e) =>
                Alert.alert('Could not update', friendlyHouseholdVaultAclCopy(closetAlertText(e))),
            },
          ),
      },
    ]);
  }

  /** One confirmed spend. A retry re-sends the same key, so the server applies it once. */
  function sendSpend(accountId: string, amountMinor: number, idempotencyKey: string) {
    spendVault.mutate(
      { accountId, amountMinor, idempotencyKey },
      {
        onError: (e) =>
          Alert.alert('Spend not recorded', friendlyHouseholdVaultAclCopy(closetAlertText(e)), [
            { text: 'OK', style: 'cancel' },
            { text: 'Try again', onPress: () => sendSpend(accountId, amountMinor, idempotencyKey) },
          ]),
      },
    );
  }

  async function markSpent(account: { id: string; merchant: string; currency: string; balanceCacheMinor: number }) {
    const balance = formatMinor(account.balanceCacheMinor, account.currency);
    const values = await ask({
      title: `Spent at ${account.merchant}`,
      message: `Balance ${balance}. How much did you use?`,
      fields: [{ key: 'amount', label: `Amount in ${account.currency}`, placeholder: 'e.g. 250', keyboardType: 'decimal-pad' }],
      confirmLabel: 'Mark spent',
      validate: (v) => {
        const minor = parseAmountInput(v.amount!, account.currency);
        if (!minor) return 'Enter an amount above zero.';
        return minor > account.balanceCacheMinor ? `That is more than the ${balance} balance.` : null;
      },
    });
    if (!values) return;
    sendSpend(account.id, parseAmountInput(values.amount!, account.currency)!, newIdempotencyKey());
  }

  return (
    <ClosetScreen
      title="Household"
      subtitle="Invite a partner — shared laundry, inventory & vault (view-only by default)."
      loading={isLoading && households.length === 0}
      hasContent={households.length > 0 || Boolean(name)}
      error={isError ? closetAlertText(error) : null}
      onRetry={() => void refetch()}
    >
      <View style={styles.pad}>
        <View style={styles.card} testID="active-household">
          <Text style={styles.label}>Switcher</Text>
          <Text style={styles.title}>{activeHouseholdSwitcherLabel(activeHousehold)}</Text>
          <Text style={styles.muted}>
            Tap Open on a household below to make it active for shared laundry.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Create household</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Household name"
            placeholderTextColor={textMuted}
          />
          <Button
            label="Create"
            size="sm"
            disabled={create.isPending || !name.trim()}
            onPress={() =>
              create.mutate(name.trim(), {
                onSuccess: (h) => {
                  setActiveId(h.id);
                  Alert.alert('Household ready', `Invite code ${h.inviteCode}`);
                },
                onError: (e) =>
                  Alert.alert('Failed', friendlyHouseholdAclCopy(closetAlertText(e))),
              })
            }
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Join with invite</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            placeholder="Invite code"
            placeholderTextColor={textMuted}
          />
          <Button
            label="Join"
            size="sm"
            disabled={join.isPending || code.trim().length < 4}
            onPress={() =>
              join.mutate(code.trim(), {
                onSuccess: (d) => {
                  setActiveId(d.household.id);
                  Alert.alert('Joined', d.household.name);
                },
                onError: (e) =>
                  Alert.alert('Could not join', friendlyHouseholdAclCopy(closetAlertText(e))),
              })
            }
          />
        </View>

        {households.map((h) => (
          <View key={h.id} style={styles.card}>
            <Text style={styles.title}>{h.name}</Text>
            <Text style={styles.muted}>
              {h.memberCount != null ? `${h.memberCount} member${h.memberCount === 1 ? '' : 's'} · ` : ''}
              code {h.inviteCode}
            </Text>
            <View style={styles.row}>
              <Button label={activeId === h.id ? "Active" : "Open"} size="sm" variant={activeId === h.id ? "secondary" : undefined} onPress={() => setActiveId(h.id)} />
              <Button
                label="Share invite"
                size="sm"
                variant="ghost"
                onPress={() => {
                  void Share.share({
                    message: `Join our WORN household: https://worn.app/h/${h.inviteCode}`,
                  });
                }}
              />
            </View>
          </View>
        ))}

        {activeId ? (
          <View style={styles.card}>
            <Text style={styles.label}>Shared wardrobe</Text>
            <Text style={styles.muted}>{activeHouseholdSwitcherLabel(activeHousehold)}</Text>
            {aclError ? (
              <Text style={styles.muted} testID="household-acl-error">
                {aclError}
              </Text>
            ) : items.length === 0 ? (
              <Text style={styles.muted}>No items yet — add pieces from Wardrobe.</Text>
            ) : (
              items.slice(0, 20).map((item) => (
                <Text key={item.id} style={styles.item}>
                  {item.category}
                  {item.brand ? ` · ${item.brand}` : ''} · {laundryLabel(item.laundryStatus)}
                </Text>
              ))
            )}
            <Button
              label="Back to wardrobe"
              size="sm"
              variant="ghost"
              onPress={() => router.push('/(closet)/wardrobe')}
            />
          </View>
        ) : null}

        {activeId ? (
          <View style={styles.card} testID="household-vault">
            <Text style={styles.label}>Shared vault</Text>
            <Text style={styles.muted}>
              Balances only — no card numbers. You {vault.data?.myAccess === 'SPEND' ? 'can spend' : 'can view'}
              {vault.data?.mySpendCapMinor != null
                ? ` · cap ${formatMinor(vault.data.mySpendCapMinor, currency)}`
                : ''}
            </Text>
            {vaultAclError ? (
              <Text style={styles.muted} testID="household-vault-acl-error">
                {vaultAclError}
              </Text>
            ) : null}
            {vaultMembers.map((m, i) => {
              const label = `member ${i + 1}`;
              return (
                <View key={m.userId} style={styles.row}>
                  <Text style={styles.item}>
                    Member {i + 1} · {accessLabel(m.vaultAccess)}
                    {m.vaultAccess === 'SPEND' && m.spendCapMinor != null
                      ? ` · cap ${formatMinor(m.spendCapMinor, currency)}`
                      : ''}
                  </Text>
                  <Button
                    label={m.vaultAccess === 'SPEND' ? 'Make view-only' : 'Allow spend'}
                    size="sm"
                    variant="ghost"
                    disabled={patchVault.isPending}
                    onPress={() =>
                      m.vaultAccess === 'SPEND' ? makeViewOnly(m.userId, label) : void allowSpend(m.userId, label)
                    }
                  />
                </View>
              );
            })}
            {vaultAccounts.length === 0 ? (
              <Text style={styles.muted}>No shared credits yet.</Text>
            ) : (
              vaultAccounts.slice(0, 20).map((a) => (
                <View key={a.id} style={styles.row}>
                  <Text style={styles.item}>
                    {a.merchant} · {formatMinor(a.balanceCacheMinor, a.currency)}
                  </Text>
                  {vault.data?.myAccess === 'SPEND' && a.balanceCacheMinor > 0 ? (
                    <Button
                      label="Mark spent"
                      size="sm"
                      variant="ghost"
                      disabled={spendVault.isPending}
                      onPress={() => void markSpent(a)}
                    />
                  ) : null}
                </View>
              ))
            )}
          </View>
        ) : null}
      </View>
      {promptElement}
    </ClosetScreen>
  );
}

const styles = StyleSheet.create({
  pad: { gap: space4 },
  card: {
    backgroundColor: surface,
    borderRadius: radiusMd,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: border,
    padding: space4,
    gap: 8,
  },
  label: { fontFamily: fontSans, fontSize: fsCaption, color: textMuted },
  title: { fontFamily: fontSans, fontSize: fsBody, color: text, fontWeight: '600' },
  muted: { fontFamily: fontSans, fontSize: fsCaption, color: textMuted },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: border,
    borderRadius: radiusMd,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fontSans,
    fontSize: fsBody,
    color: text,
  },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  item: { fontFamily: fontSans, fontSize: fsCaption, color: text },
});

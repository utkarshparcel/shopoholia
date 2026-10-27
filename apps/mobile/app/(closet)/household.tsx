import { useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
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
import {
  useCreateHousehold,
  useHouseholdVault,
  useHouseholdWardrobe,
  useHouseholds,
  useJoinHousehold,
  usePatchHouseholdVaultMember,
  useSpendHouseholdVault,
} from '@/src/hooks/closet/useCloset';
import { FEATURE_CLOSET } from '@/src/lib/features';
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

export default function HouseholdScreen() {
  const router = useRouter();
  const { data, isLoading } = useHouseholds();
  const create = useCreateHousehold();
  const join = useJoinHousehold();
  const [name, setName] = useState('Our home');
  const [code, setCode] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const wardrobe = useHouseholdWardrobe(activeId);
  const vault = useHouseholdVault(activeId);
  const patchVault = usePatchHouseholdVaultMember(activeId);
  const spendVault = useSpendHouseholdVault(activeId);
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
    return (
      <ClosetScreen
        title="Household"
        subtitle="Enable EXPO_PUBLIC_FEATURE_CLOSET=1 to share a closet."
      />
    );
  }

  const items = wardrobe.data?.items ?? [];
  const vaultAccounts = vault.data?.accounts ?? [];
  const vaultMembers = vault.data?.members ?? [];

  return (
    <ClosetScreen
      title="Household"
      subtitle="Invite a partner — shared laundry, inventory & vault (view-only by default)."
      loading={isLoading && households.length === 0}
      hasContent={households.length > 0 || Boolean(name)}
    >
      <ScrollView contentContainerStyle={styles.pad}>
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
                  Alert.alert('Failed', friendlyHouseholdAclCopy((e as Error).message)),
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
                  Alert.alert('Could not join', friendlyHouseholdAclCopy((e as Error).message)),
              })
            }
          />
        </View>

        {households.map((h) => (
          <View key={h.id} style={styles.card}>
            <Text style={styles.title}>{h.name}</Text>
            <Text style={styles.muted}>
              {h.memberCount ?? '?'} members · code {h.inviteCode}
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
                  {item.brand ? ` · ${item.brand}` : ''} · {item.laundryStatus ?? 'CLEAN'}
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
              Balances only — no card numbers. Your access:{' '}
              {vault.data?.myAccess ?? 'VIEW'}
              {vault.data?.mySpendCapMinor != null
                ? ` · cap ${formatMinor(vault.data.mySpendCapMinor)}`
                : ''}
            </Text>
            {vaultAclError ? (
              <Text style={styles.muted} testID="household-vault-acl-error">
                {vaultAclError}
              </Text>
            ) : null}
            {vaultMembers.map((m) => (
                <View key={m.userId} style={styles.row}>
                  <Text style={styles.item}>
                    Member · {m.vaultAccess}
                    {m.spendCapMinor != null
                      ? ` · cap ${formatMinor(m.spendCapMinor)}`
                      : ''}
                  </Text>
                  <Button
                    label={m.vaultAccess === 'SPEND' ? 'Make view-only' : 'Allow spend'}
                    size="sm"
                    variant="ghost"
                    disabled={patchVault.isPending}
                    onPress={() =>
                      patchVault.mutate(
                        {
                          userId: m.userId,
                          vaultAccess: m.vaultAccess === 'SPEND' ? 'VIEW' : 'SPEND',
                          spendCapMinor: m.spendCapMinor ?? 500000,
                        },
                        {
                          onError: (e) =>
                            Alert.alert(
                              'Could not update',
                              friendlyHouseholdVaultAclCopy((e as Error).message),
                            ),
                        },
                      )
                    }
                  />
                </View>
              ))}
            {vaultAccounts.length === 0 ? (
              <Text style={styles.muted}>No shared credits yet.</Text>
            ) : (
              vaultAccounts.slice(0, 20).map((a) => (
                <View key={a.id} style={styles.row}>
                  <Text style={styles.item}>
                    {a.merchant} · {formatMinor(a.balanceCacheMinor, a.currency)}
                  </Text>
                  {vault.data?.myAccess === 'SPEND' ? (
                    <Button
                      label="Mark spent"
                      size="sm"
                      variant="ghost"
                      disabled={spendVault.isPending}
                      onPress={() => {
                        const amountMinor = Math.min(10000, a.balanceCacheMinor);
                        if (amountMinor <= 0) {
                          Alert.alert('Nothing to spend');
                          return;
                        }
                        spendVault.mutate(
                          {
                            accountId: a.id,
                            amountMinor,
                            idempotencyKey:
                              globalThis.crypto?.randomUUID?.() ??
                              '00000000-0000-4000-8000-000000000001',
                          },
                          {
                            onError: (e) =>
                              Alert.alert(
                                'Spend blocked',
                                friendlyHouseholdVaultAclCopy((e as Error).message),
                              ),
                          },
                        );
                      }}
                    />
                  ) : null}
                </View>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
    </ClosetScreen>
  );
}

const styles = StyleSheet.create({
  pad: { padding: space4, gap: space4 },
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

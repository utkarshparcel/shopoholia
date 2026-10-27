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
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/src/components/ui';
import { ClosetScreen } from '@/src/components/ClosetScreen';
import { createSwapListing, fetchSwapInvite } from '@/src/api/client';
import {
  useBorrowSwapListing,
  useCreateSwapCircle,
  useJoinSwapCircle,
  useSwapCircles,
  useSwapListings,
  useWardrobe,
} from '@/src/hooks/closet/useCloset';
import { useSessionUserId } from '@/src/hooks/closet/keys';
import { CLOSET_OFF_SUBTITLE, closetAlertText } from '@/src/lib/closetScreenState';
import { FEATURE_CLOSET } from '@/src/lib/features';
import { useSessionStore } from '@/src/stores/session';
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

const LISTING_STATUS_LABEL: Record<string, string> = {
  LISTED: 'Available',
  BORROWED: 'Borrowed',
  RETURNED: 'Returned',
  CANCELLED: 'Withdrawn',
};

export default function SwapCircleScreen() {
  const router = useRouter();
  const accessToken = useSessionStore((s) => s.accessToken);
  const { data, isLoading } = useSwapCircles();
  const create = useCreateSwapCircle();
  const join = useJoinSwapCircle();
  const borrow = useBorrowSwapListing();
  // A page of pieces at a time (MOB 14); "Show more pieces" loads the next one.
  const wardrobe = useWardrobe(undefined, { limit: 20 });
  const userId = useSessionUserId();
  const [name, setName] = useState('Friends swap');
  const [code, setCode] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const listings = useSwapListings(activeId);
  const queryClient = useQueryClient();
  const [sharingId, setSharingId] = useState<string | null>(null);
  const listItem = useMutation({
    mutationFn: ({ circleId, itemId }: { circleId: string; itemId: string }) => {
      if (!accessToken) throw new Error('Sign in again to list items.');
      return createSwapListing(accessToken, circleId, itemId);
    },
    onSuccess: () => {
      // By prefix: the listings key's later parts (user, token) differ between hook versions.
      void queryClient.invalidateQueries({ queryKey: ['swap-listings'] });
    },
  });
  const itemNames = useMemo(
    () =>
      new Map(
        (wardrobe.data?.items ?? []).map((it) => [it.id, `${it.brand ? `${it.brand} · ` : ''}${it.category}`]),
      ),
    [wardrobe.data],
  );

  async function shareInvite(circleId: string) {
    if (!accessToken) {
      Alert.alert('Sign in again', 'Sign in again to share an invite.');
      return;
    }
    setSharingId(circleId);
    try {
      const inv = await fetchSwapInvite(accessToken, circleId);
      await Share.share({ message: `Join my WORN swap circle: ${inv.inviteUrl}` });
    } catch (e) {
      Alert.alert('Could not share the invite', closetAlertText(e));
    } finally {
      setSharingId(null);
    }
  }

  if (!FEATURE_CLOSET) {
    return (
      <ClosetScreen title="Swap circle" subtitle={CLOSET_OFF_SUBTITLE} />
    );
  }

  const circles = data?.circles ?? [];
  const items = wardrobe.data?.items ?? [];

  return (
    <ClosetScreen
      title="Swap circle"
      subtitle="Invite-only barter — not the public marketplace."
      loading={isLoading && circles.length === 0}
      hasContent={circles.length > 0 || Boolean(name)}
    >
      <View style={styles.pad}>
        <View style={styles.card}>
          <Text style={styles.label}>Create circle</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Circle name"
            placeholderTextColor={textMuted}
          />
          <Button
            label="Create"
            size="sm"
            disabled={create.isPending || !name.trim()}
            onPress={() =>
              create.mutate(name.trim(), {
                onSuccess: (c) => {
                  setActiveId(c.id);
                  Alert.alert('Circle ready', `Invite code ${c.inviteCode}`);
                },
                onError: (e) => Alert.alert('Failed', closetAlertText(e)),
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
            variant="secondary"
            disabled={join.isPending || code.trim().length < 4}
            onPress={() =>
              join.mutate(code.trim(), {
                onSuccess: (d) => {
                  setActiveId(d.circle.id);
                  setCode('');
                  Alert.alert('Joined', d.circle.name);
                },
                onError: (e) => Alert.alert('Failed', closetAlertText(e)),
              })
            }
          />
        </View>

        {circles.map((c) => (
          <View key={c.id} style={styles.card}>
            <Text style={styles.title}>{c.name}</Text>
            <Text style={styles.muted}>
              {c.memberCount != null ? `${c.memberCount} member${c.memberCount === 1 ? '' : 's'} · ` : ''}
              code {c.inviteCode}
            </Text>
            <View style={styles.row}>
              <Button
                label={activeId === c.id ? 'Selected' : 'Open'}
                size="sm"
                variant={activeId === c.id ? 'primary' : 'secondary'}
                onPress={() => setActiveId(c.id)}
              />
              <Button
                label="Share invite"
                size="sm"
                variant="secondary"
                disabled={sharingId === c.id}
                onPress={() => void shareInvite(c.id)}
              />
            </View>
          </View>
        ))}

        {activeId ? (
          <View style={styles.card}>
            <Text style={styles.label}>List an item</Text>
            {items.map((it) => (
              <View key={it.id} style={styles.row}>
                <Text style={styles.body}>
                  {it.brand ? `${it.brand} · ` : ''}
                  {it.category}
                </Text>
                <Button
                  label="List"
                  size="sm"
                  disabled={listItem.isPending}
                  onPress={() =>
                    listItem.mutate(
                      { circleId: activeId, itemId: it.id },
                      {
                        onSuccess: () => Alert.alert('Listed', 'Friends in the circle can borrow it.'),
                        onError: (e) => Alert.alert('Could not list it', closetAlertText(e)),
                      },
                    )
                  }
                />
              </View>
            ))}
            {wardrobe.hasNextPage ? (
              <Button
                label={wardrobe.isFetchingNextPage ? 'Loading…' : 'Show more pieces'}
                size="sm"
                variant="ghost"
                disabled={wardrobe.isFetchingNextPage}
                onPress={() => void wardrobe.fetchNextPage()}
              />
            ) : null}
            <Text style={[styles.label, { marginTop: space4 }]}>Circle listings</Text>
            {(listings.data?.listings ?? []).map((l) => (
              <View key={l.id} style={styles.row}>
                <Text style={styles.body}>
                  {itemNames.get(l.wardrobeItemId) ??
                    (l.ownerUserId === userId ? 'One of your pieces' : 'A friend’s piece')}{' '}
                  · {LISTING_STATUS_LABEL[l.status] ?? l.status.toLowerCase()}
                </Text>
                {l.status === 'LISTED' ? (
                  <Button
                    label="Borrow"
                    size="sm"
                    disabled={borrow.isPending}
                    onPress={() =>
                      borrow.mutate(
                        { circleId: activeId, listingId: l.id },
                        {
                          onSuccess: () => Alert.alert('Borrowed', 'Enjoy — return when done.'),
                          onError: (e) => Alert.alert('Failed', closetAlertText(e)),
                        },
                      )
                    }
                  />
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        <Button
          label="Back to market"
          size="sm"
          variant="secondary"
          onPress={() => router.push('/(closet)/disposition' as never)}
        />
      </View>
    </ClosetScreen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingBottom: space4 },
  card: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    marginBottom: space4,
    padding: space4,
  },
  label: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    letterSpacing: 0.4,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  title: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '600',
  },
  body: {
    color: text,
    flex: 1,
    fontFamily: fontSans,
    fontSize: fsBody,
  },
  muted: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    marginTop: 4,
  },
  input: {
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    marginBottom: space4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    marginTop: 8,
  },
});

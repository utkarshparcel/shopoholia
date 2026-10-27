import { useState } from 'react';
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

import { Button } from '@/src/components/ui';
import { ClosetScreen } from '@/src/components/ClosetScreen';
import {
  useBorrowSwapListing,
  useCreateSwapCircle,
  useJoinSwapCircle,
  useSwapCircles,
  useSwapListings,
  useWardrobe,
} from '@/src/hooks/closet/useCloset';
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

export default function SwapCircleScreen() {
  const router = useRouter();
  const accessToken = useSessionStore((s) => s.accessToken);
  const { data, isLoading } = useSwapCircles();
  const create = useCreateSwapCircle();
  const join = useJoinSwapCircle();
  const borrow = useBorrowSwapListing();
  const wardrobe = useWardrobe();
  const [name, setName] = useState('Friends swap');
  const [code, setCode] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const listings = useSwapListings(activeId);

  if (!FEATURE_CLOSET) {
    return (
      <ClosetScreen
        title="Swap circle"
        subtitle="Enable EXPO_PUBLIC_FEATURE_CLOSET=1 to barter with friends."
      />
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
      <ScrollView contentContainerStyle={styles.pad}>
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
                onError: (e) => Alert.alert('Failed', (e as Error).message),
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
                onError: (e) => Alert.alert('Failed', (e as Error).message),
              })
            }
          />
        </View>

        {circles.map((c) => (
          <View key={c.id} style={styles.card}>
            <Text style={styles.title}>{c.name}</Text>
            <Text style={styles.muted}>
              {c.memberCount ?? '?'} members · code {c.inviteCode}
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
                onPress={async () => {
                  try {
                    const inv = await import('@/src/api/client').then((m) =>
                      m.fetchSwapInvite(accessToken!, c.id),
                    );
                    await Share.share({
                      message: `Join my WORN swap circle: ${inv.inviteUrl}`,
                    });
                  } catch (e) {
                    Alert.alert('Failed', (e as Error).message);
                  }
                }}
              />
            </View>
          </View>
        ))}

        {activeId ? (
          <View style={styles.card}>
            <Text style={styles.label}>List an item</Text>
            {items.slice(0, 8).map((it) => (
              <View key={it.id} style={styles.row}>
                <Text style={styles.body}>
                  {it.brand ? `${it.brand} · ` : ''}
                  {it.category}
                </Text>
                <Button
                  label="List"
                  size="sm"
                  onPress={() =>
                    import('@/src/api/client')
                      .then((m) => m.createSwapListing(accessToken!, activeId, it.id))
                      .then(() => {
                        void listings.refetch();
                        Alert.alert('Listed', 'Friends in the circle can borrow it.');
                      })
                      .catch((e) => Alert.alert('Failed', (e as Error).message))
                  }
                />
              </View>
            ))}
            <Text style={[styles.label, { marginTop: space4 }]}>Circle listings</Text>
            {(listings.data?.listings ?? []).map((l) => (
              <View key={l.id} style={styles.row}>
                <Text style={styles.body}>
                  {l.status} · {l.wardrobeItemId.slice(0, 8)}
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
                          onError: (e) => Alert.alert('Failed', (e as Error).message),
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
      </ScrollView>
    </ClosetScreen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingBottom: 48 },
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

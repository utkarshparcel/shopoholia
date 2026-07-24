import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ListingCard, SectionHeader } from '@/src/components/ui';
import type { PlaceholderTone } from '@/src/components/ui';
import { useFeed } from '@/src/hooks/catalog';
import { useLookbookStore } from '@/src/stores/lookbook';
import {
  bg,
  fontDisplay,
  fontMono,
  fontSans,
  fsBody,
  fsDisplayM,
  fsMicro,
  space4,
  space6,
  text,
  textMuted,
  trackingTight,
} from '@/src/theme/tokens';

const TONES: PlaceholderTone[] = ['dusk', 'rose', 'sand', 'olive', 'warm'];

export default function LookbookScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const feed = useFeed(20);
  const savedIds = useLookbookStore((s) => s.savedIds);
  const toggleSave = useLookbookStore((s) => s.toggle);

  const items = useMemo(
    () => feed.data?.pages.flatMap((page) => page.items) ?? [],
    [feed.data],
  );

  const savedItems = useMemo(
    () => items.filter((item) => savedIds.has(item.id)),
    [items, savedIds],
  );

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + space6, paddingBottom: insets.bottom + 100 },
      ]}
    >
      <View style={styles.content}>
        <SectionHeader kicker="Inspiration" title="Your lookbook" />

        {savedItems.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>◫</Text>
            </View>
            <Text style={styles.emptyTitle}>Start saving looks</Text>
            <Text style={styles.emptyBody}>
              Tap the heart on any piece in Today’s edit to save it here.
            </Text>
            <Button
              label="Browse the edit"
              onPress={() => router.push('/(tabs)/feed')}
              variant="primary"
              block
            />
          </View>
        ) : (
          <FlatList
            data={savedItems}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.row}
            ListHeaderComponent={
              <Text style={styles.count}>{savedItems.length} saved pieces</Text>
            }
            renderItem={({ item, index }) => (
              <View style={styles.gridItem}>
                <ListingCard
                  brand={item.sellerName ?? item.title.split(' ')[0] ?? 'WORN'}
                  coinPrice={item.coinPrice}
                  favorited
                  imageUrl={item.houseModelImageUrl}
                  onFavorite={() => toggleSave(item.id)}
                  onPress={() => router.push(`/listing/${item.id}`)}
                  realPrice={item.realPrice}
                  title={item.title}
                  tone={TONES[index % TONES.length]}
                />
              </View>
            )}
            windowSize={7}
            maxToRenderPerBatch={6}
            removeClippedSubviews
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: space4,
  },
  count: {
    color: textMuted,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: 1.2,
    marginBottom: space4,
    textTransform: 'uppercase',
  },
  emptyBody: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsBody,
    lineHeight: 22,
    marginBottom: space6,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: '#f0ece4',
    borderRadius: 40,
    height: 80,
    justifyContent: 'center',
    marginBottom: space4,
    width: 80,
  },
  emptyIconText: {
    color: '#888078',
    fontSize: 32,
  },
  emptyState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space6,
  },
  emptyTitle: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayM,
    letterSpacing: fsDisplayM * trackingTight,
  },
  gridItem: {
    flex: 1,
    maxWidth: '50%',
  },
  row: {
    gap: space4,
    marginBottom: space4,
  },
  screen: {
    backgroundColor: bg,
    flex: 1,
  },
});

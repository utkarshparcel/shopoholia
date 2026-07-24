import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListingCard, SectionHeader } from '@/src/components/ui';
import type { PlaceholderTone } from '@/src/components/ui';
import { useFeed } from '@/src/hooks/catalog';
import {
  bg,
  fontSans,
  fontSansMedium,
  fsBody,
  space4,
  space6,
  textMuted,
  wornInk,
} from '@/src/theme/tokens';

const TONES: PlaceholderTone[] = ['dusk', 'rose', 'sand', 'olive', 'warm'];

export default function SellerListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const feed = useFeed(50);

  const items = useMemo(
    () => feed.data?.pages.flatMap((page) => page.items) ?? [],
    [feed.data],
  );

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + space6, paddingBottom: insets.bottom + space6 },
      ]}
    >
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <View style={styles.header}>
        <SectionHeader kicker="Browse stores" title="Seller listings" />
      </View>

      {feed.isLoading ? (
        <ActivityIndicator color={wornInk} style={styles.loader} />
      ) : (
        <FlatList
          data={items.filter((i) => i.sellerName)}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={{ paddingHorizontal: space4 }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyBody}>
                No seller listings yet. Become a seller to list your pieces.
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={styles.gridItem}>
              <ListingCard
                brand={item.sellerName ?? 'WORN'}
                coinPrice={item.coinPrice}
                imageUrl={item.houseModelImageUrl}
                onPress={() => router.push(`/listing/${item.id}`)}
                realPrice={item.realPrice}
                title={item.title}
                tone={TONES[index % TONES.length]}
                tag="Store"
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  back: {
    marginBottom: space4,
    paddingHorizontal: space4,
  },
  backText: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
  },
  emptyBody: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsBody,
    lineHeight: 22,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: space6,
  },
  gridItem: {
    flex: 1,
    maxWidth: '50%',
  },
  header: {
    paddingHorizontal: space4,
    marginBottom: space4,
  },
  loader: {
    marginTop: space6,
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

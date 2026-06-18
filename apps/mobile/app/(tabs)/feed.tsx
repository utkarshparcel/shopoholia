import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, ListingCard, SectionHeader } from '@/src/components/ui';
import type { PlaceholderTone } from '@/src/components/ui';
import { useFeed } from '@/src/hooks/catalog';
import { useCart } from '@/src/hooks/catalog';
import { bg, fontSansSemiBold, space4, space6, wornInk } from '@/src/theme/tokens';

const TONES: PlaceholderTone[] = ['dusk', 'rose', 'sand', 'olive', 'warm'];

function listingBrand(item: { sellerName?: string | null; title: string }) {
  if (item.sellerName) return item.sellerName;
  return item.title.split(' ')[0] ?? 'WORN';
}

export default function FeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState('All');
  const feed = useFeed(20);
  const { query: cartQuery } = useCart();

  const items = useMemo(() => {
    const flat = feed.data?.pages.flatMap((page) => page.items) ?? [];
    if (category === 'All') return flat;
    return flat.filter((item) => item.category === category);
  }, [feed.data, category]);

  const categories = useMemo(() => {
    const flat = feed.data?.pages.flatMap((page) => page.items) ?? [];
    return ['All', ...new Set(flat.map((item) => item.category))];
  }, [feed.data]);

  const cartCount = cartQuery.data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space6 }]}>
      <View style={styles.headerRow}>
        <SectionHeader kicker="Curated for you" title="Today's edit" />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/cart')}
          style={styles.cartButton}
        >
          <Text style={styles.cartIcon}>🛍</Text>
          {cartCount > 0 ? (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <View style={styles.chips}>
        {categories.map((label) => (
          <Chip
            key={label}
            active={category === label}
            label={label}
            onPress={() => setCategory(label)}
          />
        ))}
      </View>

      <FlatList
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingHorizontal: space4 }}
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) {
            void feed.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <ActivityIndicator color={wornInk} style={styles.loader} />
          ) : null
        }
        renderItem={({ item, index }) => (
          <View style={styles.gridItem}>
            <ListingCard
              brand={listingBrand(item)}
              coinPrice={item.coinPrice}
              imageUrl={item.houseModelImageUrl}
              onPress={() => router.push(`/listing/${item.id}`)}
              tag={index % 5 === 0 ? 'New' : undefined}
              title={item.title}
              tone={TONES[index % TONES.length]}
            />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cartBadge: {
    alignItems: 'center',
    backgroundColor: wornInk,
    borderRadius: 9,
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -2,
    top: -2,
  },
  cartBadgeText: {
    color: '#fff',
    fontFamily: fontSansSemiBold,
    fontSize: 10,
  },
  cartButton: {
    marginRight: space4,
    marginTop: 8,
    position: 'relative',
  },
  cartIcon: {
    fontSize: 22,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: space6,
    paddingHorizontal: space4,
  },
  gridItem: {
    flex: 1,
    maxWidth: '50%',
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space4,
  },
  loader: {
    marginVertical: space4,
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

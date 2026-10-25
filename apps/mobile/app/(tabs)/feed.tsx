import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { memo, useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  type ListRenderItemInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { FeedPage } from '@/src/api/client';
import { Chip, ListingCard, SectionHeader } from '@/src/components/ui';
import type { PlaceholderTone } from '@/src/components/ui';
import { listingQueryOptions, useCart, useFeed, useFeedCategories } from '@/src/hooks/catalog';
import { useLookbookStore } from '@/src/stores/lookbook';
import {
  bg,
  border,
  fontDisplay,
  fontSans,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  fsDisplayM,
  space4,
  space6,
  surface,
  text,
  textMuted,
  trackingTight,
  wornInk,
} from '@/src/theme/tokens';

const TONES: PlaceholderTone[] = ['dusk', 'rose', 'sand', 'olive', 'warm'];

type FeedItem = FeedPage['items'][number];

function listingBrand(item: { sellerName?: string | null; title: string }) {
  if (item.sellerName) return item.sellerName;
  return item.title.split(' ')[0] ?? 'WORN';
}

/** A grid cell. The screen's handlers take the piece, so a cell only re-renders when its piece does. */
const FeedGridItem = memo(function FeedGridItem({
  item,
  favorited,
  tone,
  onOpen,
  onFavorite,
  onQuickAdd,
}: {
  item: FeedItem;
  favorited: boolean;
  tone?: PlaceholderTone;
  onOpen: (id: string) => void;
  onFavorite: (id: string) => void;
  onQuickAdd: (item: FeedItem) => void;
}) {
  return (
    <View style={styles.gridItem}>
      <ListingCard
        brand={listingBrand(item)}
        coinPrice={item.coinPrice}
        favorited={favorited}
        imageUrl={item.houseModelImageUrl}
        onFavorite={() => onFavorite(item.id)}
        onPress={() => onOpen(item.id)}
        onQuickAdd={() => onQuickAdd(item)}
        realPrice={item.realPrice}
        title={item.title}
        tone={tone}
      />
    </View>
  );
});

export default function FeedScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  // null is "All". The server filters, so a category shows all of its pieces, not just loaded ones.
  const [category, setCategory] = useState<string | null>(null);
  const feed = useFeed(20, category);
  const categoriesQuery = useFeedCategories();
  const { query: cartQuery, addMutation } = useCart();
  const addToHaul = addMutation.mutateAsync;
  const savedIds = useLookbookStore((s) => s.savedIds);
  const toggleSave = useLookbookStore((s) => s.toggle);

  const items = useMemo(
    () => feed.data?.pages.flatMap((page) => page.items) ?? [],
    [feed.data],
  );

  const openListing = useCallback((id: string) => router.push(`/listing/${id}`), [router]);

  const quickAdd = useCallback(
    (item: FeedItem) => {
      void (async () => {
        try {
          const detail = await queryClient.fetchQuery(listingQueryOptions(item.id));
          const variantId = detail.variants[0]?.id;
          if (!variantId) {
            router.push(`/listing/${item.id}`);
            return;
          }
          await addToHaul({ variantId });
          Alert.alert('Added to haul', `${item.title} · ${detail.variants[0]!.size}`, [
            { text: 'Keep browsing', style: 'cancel' },
            { text: 'View haul', onPress: () => router.push('/cart') },
          ]);
        } catch (error: unknown) {
          Alert.alert(
            'Couldn’t add',
            error instanceof Error ? error.message : 'Try again',
          );
        }
      })();
    },
    [addToHaul, queryClient, router],
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<FeedItem>) => (
      <FeedGridItem
        favorited={savedIds.has(item.id)}
        item={item}
        onFavorite={toggleSave}
        onOpen={openListing}
        onQuickAdd={quickAdd}
        tone={TONES[index % TONES.length]}
      />
    ),
    [openListing, quickAdd, savedIds, toggleSave],
  );

  const categories = categoriesQuery.data?.categories ?? [];

  const cartCount = cartQuery.data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const isInitialLoading = feed.isLoading && items.length === 0;
  const isError = feed.isError && items.length === 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space6 }]}>
      <View style={styles.headerRow}>
        <SectionHeader kicker="Curated for you" title="Today's edit" />
        <Pressable
          accessibilityLabel={`Haul${cartCount > 0 ? `, ${cartCount} items` : ''}`}
          accessibilityRole="button"
          onPress={() => router.push('/cart')}
          style={styles.cartButton}
        >
          <Text style={styles.cartLabel}>Haul</Text>
          {cartCount > 0 ? (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipsScroll}
      >
        <Chip active={category === null} label="All" onPress={() => setCategory(null)} />
        {categories.map(({ category: name }) => (
          <Chip
            key={name}
            active={category === name}
            label={name}
            onPress={() => setCategory(name)}
          />
        ))}
      </ScrollView>

      {isInitialLoading ? (
        <ActivityIndicator color={wornInk} style={styles.loader} />
      ) : isError ? (
        <View style={styles.stateBlock}>
          <Text style={styles.stateTitle}>Couldn’t load the edit</Text>
          <Text style={styles.stateBody}>Check your connection and try again.</Text>
          <Pressable accessibilityRole="button" onPress={() => void feed.refetch()} style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: insets.bottom + 100,
            paddingHorizontal: space4,
          }}
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
          ListEmptyComponent={
            <View style={styles.stateBlock}>
              <Text style={styles.stateTitle}>No pieces in this category</Text>
              <Text style={styles.stateBody}>Try another filter or browse All.</Text>
            </View>
          }
          ListFooterComponent={
            feed.isFetchingNextPage ? (
              <ActivityIndicator color={wornInk} style={styles.loader} />
            ) : null
          }
          renderItem={renderItem}
          windowSize={7}
          maxToRenderPerBatch={6}
          removeClippedSubviews
        />
      )}
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
    right: -6,
    top: -6,
  },
  cartBadgeText: {
    color: '#fff',
    fontFamily: fontSansSemiBold,
    fontSize: 10,
  },
  cartButton: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: space4,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    position: 'relative',
  },
  cartLabel: {
    color: wornInk,
    fontFamily: fontSansSemiBold,
    fontSize: fsCaption,
  },
  chips: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: space4,
    paddingRight: space6,
  },
  chipsScroll: {
    flexGrow: 0,
    marginBottom: space6,
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
    marginVertical: space6,
  },
  retry: {
    marginTop: space4,
    padding: space4,
  },
  retryText: {
    color: wornInk,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  row: {
    gap: space4,
    marginBottom: space4,
  },
  screen: {
    backgroundColor: bg,
    flex: 1,
  },
  stateBlock: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space6,
    paddingVertical: space6,
  },
  stateBody: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    marginTop: 8,
    textAlign: 'center',
  },
  stateTitle: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayM,
    letterSpacing: fsDisplayM * trackingTight,
    textAlign: 'center',
  },
});

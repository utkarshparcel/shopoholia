import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, CoinIcon } from '@/src/components/ui';
import { useCart, useListing, useTryon } from '@/src/hooks/catalog';
import {
  bg,
  border,
  fontSansMedium,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  radiusCard,
  space4,
  space6,
  surface,
  text,
  textMuted,
  wornInk,
} from '@/src/theme/tokens';

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listing = useListing(id);
  const { addMutation } = useCart();
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const tryon = useTryon(id, selectedVariantId);

  const variants = listing.data?.variants ?? [];
  const selectedVariant = useMemo(
    () => variants.find((variant) => variant.id === selectedVariantId) ?? null,
    [variants, selectedVariantId],
  );

  useEffect(() => {
    if (!selectedVariantId && variants[0]) {
      setSelectedVariantId(variants[0].id);
    }
  }, [variants, selectedVariantId]);

  const previewUrl =
    tryon.data?.status === 'READY' ? tryon.data.previewUrl : listing.data?.houseModelImageUrl;

  return (
    <ScrollView
      contentContainerStyle={{
        paddingBottom: insets.bottom + space6,
        paddingTop: insets.top + space4,
      }}
      style={styles.screen}
    >
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      {listing.isLoading ? (
        <ActivityIndicator color={wornInk} style={styles.loader} />
      ) : listing.data ? (
        <>
          <View style={styles.hero}>
            {previewUrl ? (
              <Image source={{ uri: previewUrl }} style={styles.heroImage} />
            ) : null}
            {tryon.isPending || tryon.data?.status === 'PROCESSING' ? (
              <View style={styles.tryonOverlay}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.tryonOverlayText}>Styling your look…</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.body}>
            <Text style={styles.category}>{listing.data.category}</Text>
            <Text style={styles.title}>{listing.data.title}</Text>
            <View style={styles.priceRow}>
              <CoinIcon />
              <Text style={styles.price}>{listing.data.coinPrice}</Text>
            </View>

            <Text style={styles.sectionLabel}>Size & color</Text>
            <View style={styles.variantRow}>
              {variants.map((variant) => (
                <Chip
                  key={variant.id}
                  active={variant.id === selectedVariantId}
                  label={`${variant.size} · ${variant.color}`}
                  onPress={() => setSelectedVariantId(variant.id)}
                />
              ))}
            </View>

            <View style={styles.actions}>
              <Button
                label={tryon.isPending ? 'Trying on…' : 'Try on me'}
                onPress={() => {
                  void tryon
                    .mutateAsync()
                    .then((result) => {
                      if (result.status === 'PROCESSING') {
                        setTimeout(() => {
                          void tryon.mutateAsync().catch(() => undefined);
                        }, 400);
                      }
                    })
                    .catch(() => undefined);
                }}
                variant="secondary"
              />
              <Button
                disabled={!selectedVariant || addMutation.isPending}
                label={addMutation.isPending ? 'Adding…' : 'Add to haul'}
                onPress={() => {
                  if (!selectedVariant) return;
                  void addMutation.mutateAsync({ variantId: selectedVariant.id }).catch(() => undefined);
                }}
              />
            </View>
          </View>
        </>
      ) : (
        <Text style={styles.error}>Listing not found.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 12,
    marginTop: space6,
  },
  back: {
    marginBottom: space4,
    paddingHorizontal: space4,
  },
  backText: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
  },
  body: {
    paddingHorizontal: space4,
  },
  category: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  error: {
    color: textMuted,
    paddingHorizontal: space4,
  },
  hero: {
    aspectRatio: 3 / 4,
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusCard,
    marginBottom: space6,
    marginHorizontal: space4,
    overflow: 'hidden',
    position: 'relative',
  },
  heroImage: {
    height: '100%',
    width: '100%',
  },
  loader: {
    marginTop: space6,
  },
  price: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  priceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  screen: {
    backgroundColor: bg,
    flex: 1,
  },
  sectionLabel: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
    marginBottom: 8,
    marginTop: space6,
  },
  title: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: 24,
    marginTop: 4,
  },
  tryonOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: 'rgba(15,14,12,0.45)',
    gap: 8,
    justifyContent: 'center',
  },
  tryonOverlayText: {
    color: '#fff',
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
  },
  variantRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});

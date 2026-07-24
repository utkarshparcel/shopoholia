import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, CoinIcon } from '@/src/components/ui';
import { useCart, useListing, useTryon } from '@/src/hooks/catalog';
import { trackEvent } from '@/src/lib/analytics';
import { recordAffiliateClick, type AffiliateLink } from '@/src/api/client';
import { useSessionStore } from '@/src/stores/session';
import {
  bg,
  border,
  fontMono,
  fontSans,
  fontSansMedium,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  fsMicro,
  radiusCard,
  space4,
  space6,
  surface,
  text,
  textMuted,
  wornInk,
} from '@/src/theme/tokens';

const PLATFORM_ICONS: Record<string, string> = {
  flipkart: 'FK',
  amazon: 'Amz',
  myntra: 'My',
  ajio: 'Aj',
  nykaa: 'Ny',
};

const PLATFORM_COLORS: Record<string, string> = {
  flipkart: '#2874f0',
  amazon: '#ff9900',
  myntra: '#e44d8e',
  ajio: '#e53935',
  nykaa: '#fe3464',
};

function AffiliateButton({
  link,
  listingId,
  accessToken,
}: {
  link: AffiliateLink;
  listingId: string;
  accessToken: string | null;
}) {
  const platform = link.platform;
  const color = PLATFORM_COLORS[platform] ?? wornInk;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        trackEvent('affiliate_click', { platform, url: link.url });
        if (accessToken) {
          void recordAffiliateClick(accessToken, listingId, platform);
        }
        Linking.openURL(link.url).catch(() => {});
      }}
      style={({ pressed }) => [
        styles.affiliateBtn,
        { borderColor: color, backgroundColor: pressed ? color + '15' : surface },
      ]}
    >
      <View style={[styles.affiliateBadge, { backgroundColor: color }]}>
        <Text style={styles.affiliateBadgeText}>
          {PLATFORM_ICONS[platform] ?? 'Go'}
        </Text>
      </View>
      <Text style={[styles.affiliateLabel, { color }]}>{link.label}</Text>
    </Pressable>
  );
}

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accessToken = useSessionStore((s) => s.accessToken);
  const listing = useListing(id);
  const { addMutation } = useCart();
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [heroFailed, setHeroFailed] = useState(false);
  const tryon = useTryon(id, selectedVariantId);

  const variants = listing.data?.variants ?? [];
  const selectedVariant = useMemo(
    () => variants.find((variant) => variant.id === selectedVariantId) ?? null,
    [variants, selectedVariantId],
  );
  const previewUrl =
    tryon.data?.status === 'READY' ? tryon.data.previewUrl : listing.data?.houseModelImageUrl;
  const affiliateLinks = listing.data?.affiliateLinks ?? [];

  useEffect(() => {
    if (!selectedVariantId && variants[0]) {
      setSelectedVariantId(variants[0].id);
    }
  }, [variants, selectedVariantId]);

  useEffect(() => {
    setHeroFailed(false);
  }, [id, previewUrl]);

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
            {previewUrl && !heroFailed ? (
              <Image
                onError={() => setHeroFailed(true)}
                source={{ uri: previewUrl }}
                style={styles.heroImage}
              />
            ) : (
              <View style={styles.heroFallback} />
            )}
            {tryon.isPending || tryon.data?.status === 'PROCESSING' ? (
              <View style={styles.tryonOverlay}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.tryonOverlayText}>Styling your look…</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.body}>
            <View style={styles.categoryRow}>
              <Text style={styles.category}>{listing.data.category}</Text>
              {listing.data.tags?.map((tag) => (
                <View key={tag} style={styles.tagPill}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.title}>{listing.data.title}</Text>

            <View style={styles.priceRow}>
              <View style={styles.coinPriceGroup}>
                <CoinIcon />
                <Text style={styles.price}>{listing.data.coinPrice} coins</Text>
              </View>
              {listing.data.realPrice ? (
                <Text style={styles.realPrice}>partner {listing.data.realPrice}</Text>
              ) : null}
            </View>
            <Text style={styles.priceHint}>
              Coins unlock the in-app haul & reveal. Store prices are for optional partner checkout.
            </Text>

            <View style={styles.divider} />

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
                    .catch((error: unknown) => {
                      const message =
                        error instanceof Error ? error.message : 'Try-on failed';
                      if (/avatar/i.test(message)) {
                        Alert.alert('Avatar needed', 'Upload your avatar to try pieces on you.', [
                          { text: 'Not now', style: 'cancel' },
                          {
                            text: 'Upload avatar',
                            onPress: () => router.push('/(onboarding)/avatar'),
                          },
                        ]);
                        return;
                      }
                      Alert.alert('Try-on failed', message);
                    });
                }}
                variant="primary"
                block
              />
              <Button
                disabled={!selectedVariant || addMutation.isPending}
                label={addMutation.isPending ? 'Adding…' : 'Add to haul'}
                onPress={() => {
                  if (!selectedVariant) return;
                  void addMutation
                    .mutateAsync({ variantId: selectedVariant.id })
                    .then(() => {
                      Alert.alert('Added to haul', listing.data?.title ?? 'Item saved', [
                        { text: 'Keep browsing', style: 'cancel' },
                        { text: 'View haul', onPress: () => router.push('/cart') },
                      ]);
                    })
                    .catch((error: unknown) => {
                      Alert.alert(
                        'Couldn’t add',
                        error instanceof Error ? error.message : 'Try again',
                      );
                    });
                }}
                variant="secondary"
                block
              />
            </View>

            {affiliateLinks.length > 0 && (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionLabel}>Buy for real</Text>
                <Text style={styles.affiliateSubtext}>
                  Partner links — may earn you cashback coins after purchase confirmation.
                </Text>
                <View style={styles.affiliateRow}>
                  {affiliateLinks.map((link, i) => (
                    <AffiliateButton
                      key={i}
                      accessToken={accessToken}
                      link={link}
                      listingId={listing.data!.id}
                    />
                  ))}
                </View>
              </>
            )}
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
  affiliateBadge: {
    alignItems: 'center',
    borderRadius: 6,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  affiliateBadgeText: {
    color: '#fff',
    fontFamily: fontSansSemiBold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  affiliateBtn: {
    alignItems: 'center',
    borderColor: border,
    borderRadius: 12,
    borderWidth: 1.5,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 140,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  affiliateLabel: {
    fontFamily: fontSansSemiBold,
    fontSize: 12,
  },
  affiliateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  affiliateSubtext: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 20,
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
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  categoryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  coinPriceGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  divider: {
    backgroundColor: border,
    height: 1,
    marginVertical: space6,
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
  heroFallback: {
    backgroundColor: '#e9ddca',
    flex: 1,
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
  priceHint: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
    marginTop: 8,
  },
  priceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  realPrice: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
  },
  screen: {
    backgroundColor: bg,
    flex: 1,
  },
  sectionLabel: {
    color: textMuted,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: 1.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  tagPill: {
    backgroundColor: 'rgba(200,168,122,0.12)',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: {
    color: '#9c7a4e',
    fontFamily: fontMono,
    fontSize: 8,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
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

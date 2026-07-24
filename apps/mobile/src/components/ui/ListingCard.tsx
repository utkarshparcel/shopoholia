import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ViewProps } from 'react-native';

import {
  accentSoft,
  border,
  fontMono,
  fontSansMedium,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  fsMicro,
  price,
  radiusCard,
  sale,
  shadowSm,
  surface,
  text,
  textMuted,
  wornInk,
  wornPaper,
} from '@/src/theme/tokens';

export type ListingCardVariant = 'grid' | 'feed';
export type PlaceholderTone = 'rose' | 'sand' | 'olive' | 'dusk' | 'warm';

export type ListingCardProps = ViewProps & {
  brand: string;
  title: string;
  coinPrice: number;
  realPrice?: string | null;
  imageUrl?: string;
  variant?: ListingCardVariant;
  tone?: PlaceholderTone;
  tag?: string;
  favorited?: boolean;
  onPress?: () => void;
  onQuickAdd?: () => void;
  onFavorite?: () => void;
};

const gradients: Record<PlaceholderTone, [string, string, string]> = {
  warm: ['#e9ddca', '#d8c3a6', '#c9b291'],
  rose: ['#ecd9d2', '#d9b9ad', '#c9a394'],
  sand: ['#efe6d4', '#ddcca9', '#cdb88f'],
  olive: ['#e2e2cf', '#c4c2a0', '#aaa886'],
  dusk: ['#d8cfc4', '#b9a894', '#9c8b78'],
};

export function ListingCard({
  brand: brandName,
  title,
  coinPrice,
  realPrice,
  imageUrl,
  variant = 'grid',
  tone = 'warm',
  tag,
  favorited = false,
  onPress,
  onQuickAdd,
  onFavorite,
  style,
  ...props
}: ListingCardProps) {
  const isFeed = variant === 'feed';
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !imageFailed;

  return (
    <View style={[styles.card, isFeed && styles.feedCard, shadowSm, style]} {...props}>
      <Pressable
        accessibilityRole={onPress ? 'button' : undefined}
        disabled={!onPress}
        onPress={onPress}
        style={[styles.media, isFeed && styles.feedMedia]}
      >
        {showImage ? (
          <Image
            accessibilityIgnoresInvertColors
            onError={() => setImageFailed(true)}
            source={{ uri: imageUrl }}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <LinearGradient
            colors={gradients[tone]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        {tag ? (
          <View style={styles.badges}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          </View>
        ) : null}
        {isFeed ? (
          <View style={styles.feedOverlay} pointerEvents="none">
            <View style={styles.metaPill}>
              <Text style={styles.brand}>{brandName}</Text>
              <Text style={styles.feedTitle}>{title}</Text>
            </View>
          </View>
        ) : null}
      </Pressable>
      {onFavorite ? (
        <Pressable
          accessibilityLabel={favorited ? 'Remove from lookbook' : 'Save to lookbook'}
          accessibilityRole="button"
          onPress={onFavorite}
          style={styles.heart}
        >
          <Text style={[styles.heartIcon, favorited && styles.heartIconActive]}>
            {favorited ? '♥' : '♡'}
          </Text>
        </Pressable>
      ) : null}
      {!isFeed ? (
        <View style={styles.body}>
          <Pressable disabled={!onPress} onPress={onPress}>
            <Text style={styles.brand}>{brandName}</Text>
            <Text style={styles.title}>{title}</Text>
          </Pressable>
          <View style={styles.priceRow}>
            <Pressable disabled={!onPress} onPress={onPress} style={styles.priceGroup}>
              <Text style={styles.price}>
                <Text style={styles.coin}>◎</Text> {coinPrice}{' '}
                <Text style={styles.coinUnit}>coins</Text>
              </Text>
              {realPrice ? <Text style={styles.realLabel}>{realPrice}</Text> : null}
            </Pressable>
            {onQuickAdd ? (
              <Pressable
                accessibilityLabel="Add to haul"
                accessibilityRole="button"
                onPress={onQuickAdd}
                style={styles.quickAdd}
              >
                <Text style={styles.quickAddIcon}>+</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badges: {
    left: 10,
    position: 'absolute',
    top: 10,
  },
  body: {
    paddingBottom: 14,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  brand: {
    color: textMuted,
    fontFamily: fontMono,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusCard,
    borderWidth: 1,
    overflow: 'hidden',
  },
  coin: {
    color: accentSoft,
    fontSize: 12,
  },
  coinUnit: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsMicro,
  },
  feedCard: {
    borderRadius: 16,
    maxWidth: 360,
  },
  feedMedia: {
    aspectRatio: 4 / 5,
  },
  feedOverlay: {
    bottom: 12,
    flexDirection: 'row',
    left: 12,
    position: 'absolute',
    right: 12,
  },
  feedTitle: {
    color: text,
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
    marginTop: 2,
  },
  heart: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: 10,
    top: 10,
    width: 34,
    zIndex: 2,
  },
  heartIcon: {
    color: text,
    fontSize: 16,
  },
  heartIconActive: {
    color: sale,
  },
  media: {
    aspectRatio: 3 / 4,
    position: 'relative',
  },
  metaPill: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  price: {
    color: price,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  priceGroup: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexShrink: 1,
    flexWrap: 'wrap',
    gap: 8,
  },
  priceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  quickAdd: {
    alignItems: 'center',
    backgroundColor: wornInk,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  quickAddIcon: {
    color: wornPaper,
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 22,
  },
  realLabel: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
  },
  tag: {
    backgroundColor: 'rgba(15,14,12,0.35)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    color: 'rgba(255,255,255,0.92)',
    fontFamily: fontMono,
    fontSize: 9,
    letterSpacing: 1.35,
    textTransform: 'uppercase',
  },
  title: {
    color: text,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
    marginBottom: 0,
    marginTop: 3,
  },
});

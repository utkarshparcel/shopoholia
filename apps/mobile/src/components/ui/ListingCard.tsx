import React, { memo, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View, type ViewProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  withDelay,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';

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
  radiusMd,
  sale,
  shadowSm,
  surface,
  text,
  textMuted,
  wornInk,
  wornPaper,
  springPresets,
} from '@/src/theme/tokens';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';

export type ListingCardVariant = 'grid' | 'feed' | 'compact';
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
  index?: number; // For stagger animations
};

const gradients: Record<PlaceholderTone, [string, string, string]> = {
  warm: ['#e9ddca', '#d8c3a6', '#c9b291'],
  rose: ['#ecd9d2', '#d9b9ad', '#c9a394'],
  sand: ['#efe6d4', '#ddcca9', '#cdb88f'],
  olive: ['#e2e2cf', '#c4c2a0', '#aaa886'],
  dusk: ['#d8cfc4', '#b9a894', '#9c8b78'],
};

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedImage = Animated.createAnimatedComponent(Image);
const AnimatedText = Animated.createAnimatedComponent(Text);
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export const ListingCard = memo(function ListingCard({
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
  index = 0,
  ...props
}: ListingCardProps) {
  const isFeed = variant === 'feed';
  const isCompact = variant === 'compact';
  const reducedMotion = useReducedMotion();
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !imageFailed;

  // Entrance animation
  const entrance = useSharedValue(0);
  const imageScale = useSharedValue(1);
  const favoriteScale = useSharedValue(favorited ? 1.2 : 1);

  // Staggered entrance
  React.useEffect(() => {
    if (reducedMotion) {
      entrance.value = withTiming(1, { duration: 0 });
      return;
    }
    entrance.value = withDelay(index * 60, withSpring(1, springPresets.gentle));
    imageScale.value = withDelay(index * 60 + 100, withSpring(1, springPresets.gentle));
  }, [index, reducedMotion]);

  // Favorite animation
  React.useEffect(() => {
    if (reducedMotion) {
      favoriteScale.value = withTiming(favorited ? 1.2 : 1, { duration: 0 });
      return;
    }
    favoriteScale.value = withSpring(favorited ? 1.2 : 1, springPresets.playful);
  }, [favorited, reducedMotion]);

  // Quick add hover/press animation (feed variant)
  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(entrance.value, [0, 1], [0, 1], Extrapolate.CLAMP);
    const translateY = interpolate(entrance.value, [0, 1], [20, 0], Extrapolate.CLAMP);
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  const imageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: imageScale.value }],
  }));

  const favoriteAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: favoriteScale.value }],
  }));

  const handleQuickAddPressIn = () => {
    if (reducedMotion) return;
    quickAddScale.value = withSpring(0.9, springPresets.snappy);
  };

  const handleQuickAddPressOut = () => {
    if (reducedMotion) return;
    quickAddScale.value = withSpring(1.0, springPresets.standard);
  };

  const quickAddScale = useSharedValue(1);
  const quickAddAnimatedScale = useAnimatedStyle(() => ({
    transform: [{ scale: quickAddScale.value }],
  }));

  return (
    <AnimatedView style={[styles.card, isFeed && styles.feedCard, isCompact && styles.compactCard, shadowSm, animatedStyle, style]} {...props}>
      <AnimatedPressable
        accessibilityRole={onPress ? 'button' : undefined}
        disabled={!onPress}
        onPress={onPress}
        onPressIn={() => {
          if (!reducedMotion) imageScale.value = withSpring(0.98, springPresets.snappy);
        }}
        onPressOut={() => {
          if (!reducedMotion) imageScale.value = withSpring(1.0, springPresets.standard);
        }}
        style={[
          styles.media,
          isFeed && styles.feedMedia,
          isCompact && styles.compactMedia,
          imageAnimatedStyle,
        ]}
      >
        {showImage ? (
          <AnimatedImage
            accessibilityIgnoresInvertColors
            onError={() => setImageFailed(true)}
            source={{ uri: imageUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <AnimatedLinearGradient
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
              <AnimatedText style={styles.brand}>{brandName}</AnimatedText>
              <AnimatedText style={styles.feedTitle}>{title}</AnimatedText>
            </View>
          </View>
        ) : null}
      </AnimatedPressable>
      {onFavorite ? (
        <AnimatedPressable
          accessibilityLabel={favorited ? 'Remove from lookbook' : 'Save to lookbook'}
          accessibilityRole="button"
          onPress={onFavorite}
          style={styles.heart}
        >
          <AnimatedView style={favoriteAnimatedStyle}>
            <AnimatedText style={[styles.heartIcon, favorited && styles.heartIconActive]}>
              {favorited ? '♥' : '♡'}
            </AnimatedText>
          </AnimatedView>
        </AnimatedPressable>
      ) : null}
      {!isFeed && !isCompact ? (
        <View style={styles.body}>
          <AnimatedPressable disabled={!onPress} onPress={onPress}>
            <AnimatedText style={styles.brand}>{brandName}</AnimatedText>
            <AnimatedText style={styles.title} numberOfLines={1}>{title}</AnimatedText>
          </AnimatedPressable>
          <View style={styles.priceRow}>
            <AnimatedPressable disabled={!onPress} onPress={onPress} style={styles.priceGroup}>
              <AnimatedText style={styles.price}>
                <AnimatedText style={styles.coin}>◎</AnimatedText> {coinPrice}{' '}
                <AnimatedText style={styles.coinUnit}>coins</AnimatedText>
              </AnimatedText>
              {realPrice ? <AnimatedText style={styles.realLabel}>{realPrice}</AnimatedText> : null}
            </AnimatedPressable>
            {onQuickAdd ? (
              <AnimatedPressable
                accessibilityLabel="Add to haul"
                accessibilityRole="button"
                onPress={onQuickAdd}
                onPressIn={handleQuickAddPressIn}
                onPressOut={handleQuickAddPressOut}
                style={styles.quickAdd}
              >
                <AnimatedView style={quickAddAnimatedScale}>
                  <AnimatedText style={styles.quickAddIcon}>+</AnimatedText>
                </AnimatedView>
              </AnimatedPressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </AnimatedView>
  );
});

// ──────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  badges: {
    left: 10,
    position: 'absolute',
    top: 10,
    zIndex: 2,
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
  compactCard: {
    borderRadius: radiusMd,
  },
  compactMedia: {
    aspectRatio: 1,
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
    flexDirection: 'column',
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
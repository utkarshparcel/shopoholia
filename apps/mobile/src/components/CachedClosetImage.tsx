import { useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageProps } from 'expo-image';

import { closet, fontSans, fsCaption } from '@/src/theme/tokens';

type Props = Omit<ImageProps, 'source'> & {
  uri: string;
};

/**
 * Closet photo for lists and grids. expo-image caches in memory and on disk on
 * both platforms (RN Image's `force-cache` only works on iOS), decodes at the
 * view's size rather than the photo's, and `recyclingKey` stops a reused row
 * flashing the previous photo. The style's background shows while loading; a
 * photo that fails leaves a labelled tile instead of collapsing the layout.
 */
export function CachedClosetImage({ uri, style, onError, recyclingKey, ...rest }: Props) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  if (!uri) return null;
  if (failedUri === uri) {
    return (
      <View style={[style as StyleProp<ViewStyle>, styles.fallback]} testID="closet-image-fallback">
        <Text style={styles.fallbackText}>Photo unavailable</Text>
      </View>
    );
  }
  return (
    <Image
      accessibilityIgnoresInvertColors
      cachePolicy="memory-disk"
      contentFit="cover"
      transition={120}
      {...rest}
      recyclingKey={recyclingKey ?? uri}
      source={{ uri }}
      style={style}
      onError={(e) => {
        setFailedUri(uri);
        onError?.(e);
      }}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    backgroundColor: closet.mist,
    justifyContent: 'center',
  },
  fallbackText: { color: closet.muted, fontFamily: fontSans, fontSize: fsCaption },
});

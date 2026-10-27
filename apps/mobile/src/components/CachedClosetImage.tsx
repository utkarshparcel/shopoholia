import { useState } from 'react';
import { Image, type ImageProps, type ImageStyle, type StyleProp } from 'react-native';

import { cachedImageSource } from '@/src/lib/cachedImage';

type Props = Omit<ImageProps, 'source'> & {
  uri: string;
  style?: StyleProp<ImageStyle>;
};

/** Closet thumb/image with URI cache hint; hides on load error. */
export function CachedClosetImage({ uri, style, onError, ...rest }: Props) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) return null;
  return (
    <Image
      accessibilityIgnoresInvertColors
      {...rest}
      source={cachedImageSource(uri)}
      style={style}
      onError={(e) => {
        setFailed(true);
        onError?.(e);
      }}
    />
  );
}

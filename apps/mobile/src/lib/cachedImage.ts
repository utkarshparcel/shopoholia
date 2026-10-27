import type { ImageURISource } from 'react-native';

/**
 * Image URI source with cache hint for Closet thumbs (UX-PERF-LISTS).
 * `force-cache` is respected on iOS; Android still benefits from RN disk cache
 * when the same URI is requested again.
 */
export function cachedImageSource(uri: string): ImageURISource {
  return { uri, cache: 'force-cache' };
}

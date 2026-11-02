import { Platform } from 'react-native';

/**
 * True while Expo Router renders the web build ahead of time (static rendering, in Node): there is
 * no `window`, so no storage. Code that runs at import time and touches storage waits for the
 * browser, which loads the same modules again. Always false on iOS and Android.
 */
export function isServerRendering(): boolean {
  return Platform.OS === 'web' && typeof window === 'undefined';
}

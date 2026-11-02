import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { consumeRestoreFallbackFlag } from '@/src/stores/session';

import { isServerRendering } from './ssr';

const realOS = Platform.OS;

afterEach(() => {
  (Platform as { OS: string }).OS = realOS;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isServerRendering', () => {
  it('is true only for the web build rendered without a window', () => {
    (Platform as { OS: string }).OS = 'web';
    expect(isServerRendering()).toBe(false);
    vi.stubGlobal('window', undefined);
    expect(isServerRendering()).toBe(true);
  });

  it('is never true on native, so start-up there is unchanged', () => {
    (Platform as { OS: string }).OS = 'ios';
    vi.stubGlobal('window', undefined);
    expect(isServerRendering()).toBe(false);
  });
});

describe('consumeRestoreFallbackFlag', () => {
  it('reads unreadable storage (web static rendering: no window) as no flag', async () => {
    vi.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(
      new ReferenceError('window is not defined'),
    );
    await expect(consumeRestoreFallbackFlag()).resolves.toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import {
  LIST_VIRTUALIZE_THRESHOLD,
  nestedVirtualListHeight,
  shouldVirtualizeList,
} from './listVirtualization';
import { cachedImageSource } from './cachedImage';

describe('listVirtualization (UX-PERF-LISTS)', () => {
  it('virtualizes only when count exceeds 50', () => {
    expect(LIST_VIRTUALIZE_THRESHOLD).toBe(50);
    expect(shouldVirtualizeList(50)).toBe(false);
    expect(shouldVirtualizeList(51)).toBe(true);
    expect(shouldVirtualizeList(0)).toBe(false);
  });

  it('bounds nested window height for ScrollView nesting', () => {
    expect(nestedVirtualListHeight(100, 6)).toBe(600);
  });
});

describe('cachedImageSource', () => {
  it('adds force-cache hint for Closet thumbs', () => {
    expect(cachedImageSource('https://cdn.example/a.jpg')).toEqual({
      uri: 'https://cdn.example/a.jpg',
      cache: 'force-cache',
    });
  });
});

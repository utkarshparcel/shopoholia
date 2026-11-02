import { describe, expect, it } from 'vitest';

import { listingTagLabels, storeNameFromSourceTag } from './listingTags';

describe('listing tags', () => {
  it('shows the store name instead of the internal src: tag', () => {
    expect(listingTagLabels(['src:newme', 'party'])).toEqual(['NEWME', 'party']);
    expect(listingTagLabels(['SRC:NEWME'])).toEqual(['NEWME']);
    expect(listingTagLabels(['src:amazon'])).toEqual(['Amazon']);
    expect(listingTagLabels(['src:somestore'])).toEqual(['Somestore']);
  });

  it('never shows a src: prefix, and drops internal sources and duplicates', () => {
    const labels = listingTagLabels(['src:synthetic', 'src:', 'src:shein', 'SHEIN', ' ', 'denim']);
    expect(labels).toEqual(['SHEIN', 'denim']);
    expect(labels.some((l) => /src:/i.test(l))).toBe(false);
    expect(listingTagLabels(undefined)).toEqual([]);
  });

  it('only treats src: tags as sources', () => {
    expect(storeNameFromSourceTag('newme')).toBeNull();
    expect(storeNameFromSourceTag('src:newme')).toBe('NEWME');
  });
});

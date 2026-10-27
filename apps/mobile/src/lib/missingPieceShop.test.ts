import { describe, expect, it } from 'vitest';

import { affiliatePlatformFromUrl, missingPieceShopRows } from './missingPieceShop';

describe('missingPieceShop (W068)', () => {
  it('maps affiliate hosts and builds shop rows', () => {
    expect(affiliatePlatformFromUrl('https://www.amazon.in/dp/x')).toBe('amazon');
    expect(affiliatePlatformFromUrl('https://www.myntra.com/x')).toBe('myntra');
    const rows = missingPieceShopRows([
      {
        missingSlot: 'bottom',
        suggestion: 'black trousers',
        message: 'Need black trousers for 4 tops',
        affiliateUrl: 'https://www.flipkart.com/x',
        priority: 1,
      },
    ]);
    expect(rows[0]!.platform).toBe('flipkart');
    expect(rows[0]!.ctaLabel).toBe('Shop black trousers');
  });
});

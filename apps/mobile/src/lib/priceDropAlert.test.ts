import { describe, expect, it } from 'vitest';

import { priceDropAlertFromHit } from './priceDropAlert';

describe('priceDropAlert (W029)', () => {
  it('builds soft card with amount line', () => {
    const card = priceDropAlertFromHit({
      watchId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      listingId: 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      brand: 'Zara',
      listingTitle: 'Linen Shirt',
      watchedPriceMinor: 200_000,
      currentPriceMinor: 160_000,
      dropPct: 20,
      thresholdPct: 10,
    });
    expect(card.headline).toMatch(/Zara dropped/);
    expect(card.body).toMatch(/soft tip/i);
    expect(card.amountLine).toContain('₹');
    expect(card.dismissKey).toContain(card.listingId);
  });
});

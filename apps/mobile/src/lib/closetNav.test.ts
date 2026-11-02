import { describe, expect, it } from 'vitest';

import { CLOSET_NAV_ITEMS } from './closetNav';

describe('Closet bottom bar', () => {
  it('keeps seven tabs, each label short enough to read whole at 390pt', () => {
    expect(CLOSET_NAV_ITEMS.map((i) => i.key)).toEqual([
      'today',
      'wardrobe',
      'vault',
      'accountant',
      'recipients',
      'fit',
      'disposition',
    ]);
    // "Wardrobe" is the longest label that fits a seventh of a 390pt bar at 11pt.
    for (const item of CLOSET_NAV_ITEMS) {
      expect(item.label.length, item.label).toBeLessThanOrEqual('Wardrobe'.length);
    }
  });
});

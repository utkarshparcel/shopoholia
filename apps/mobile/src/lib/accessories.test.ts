import { describe, expect, it } from 'vitest';

import {
  createAccessoryCategory,
  isAccessoryCategory,
  partitionOutfitItems,
  withAccessoryOnOutfit,
  withoutAccessoriesOnOutfit,
} from './accessories';

describe('accessories (W066)', () => {
  it('partitions outfit into core vs accessories', () => {
    const { core, accessories } = partitionOutfitItems([
      { id: '1', category: 'shirt' },
      { id: '2', category: 'necklace' },
      { id: '3', category: 'jeans' },
    ]);
    expect(core.map((c) => c.id)).toEqual(['1', '3']);
    expect(accessories.map((a) => a.id)).toEqual(['2']);
    expect(isAccessoryCategory('watch')).toBe(true);
    expect(createAccessoryCategory('Gold Necklace')).toBe('necklace');
  });

  it('attaches and swaps accessory on outfit itemIds', () => {
    const items = [
      { id: 't', category: 'shirt' },
      { id: 'a1', category: 'necklace' },
    ];
    const attached = withAccessoryOnOutfit(['t'], items, 'a1');
    expect(attached).toEqual(['t', 'a1']);
    const swapped = withAccessoryOnOutfit(['t', 'a1'], items, 'a2');
    expect(swapped).toEqual(['t', 'a2']);
    expect(withoutAccessoriesOnOutfit(['t', 'a1'], items)).toEqual(['t']);
  });
});

/**
 * Wave B returns polish acceptance (W031–W036).
 */
import { describe, expect, it } from 'vitest';
import {
  buildSizeMapTip,
  sizeMapTipForBrand,
  type SizeMapBrandRow,
} from '@worn/shared';

import {
  markRefundedCelebration,
  nudgePickupSlotHours,
  partitionReturnsByDeadline,
  refundEtaLiveLabel,
  returnPortalOpenProps,
  suggestPickupSlots,
} from './returnsPolish';

const now = new Date('2026-08-26T12:00:00.000Z');

describe('W031 returns urgency sort', () => {
  it('sorts open by deadline ASC and partitions expired collapsed', () => {
    const { open, expired } = partitionReturnsByDeadline(
      [
        {
          id: 'later',
          windowDeadline: '2026-09-10T12:00:00.000Z',
          state: 'INITIATED',
        },
        {
          id: 'soon',
          windowDeadline: '2026-08-28T12:00:00.000Z',
          state: 'INITIATED',
        },
        {
          id: 'expired',
          windowDeadline: '2026-08-01T12:00:00.000Z',
          state: 'EXPIRED',
        },
        {
          id: 'past-open-state',
          windowDeadline: '2026-08-20T12:00:00.000Z',
          state: 'INITIATED',
        },
        {
          id: 'refunded',
          windowDeadline: '2026-07-01T12:00:00.000Z',
          state: 'REFUNDED',
        },
      ],
      now,
    );

    expect(open.map((r) => r.id)).toEqual(['soon', 'later', 'refunded']);
    expect(expired.map((r) => r.id)).toEqual(['expired', 'past-open-state']);
  });
});

describe('W033 pickup slot calendar', () => {
  it('suggests future ISO slots and nudges by hour', () => {
    const slots = suggestPickupSlots(now, 4);
    expect(slots).toHaveLength(4);
    expect(slots.every((s) => Date.parse(s) > now.getTime())).toBe(true);
    const nudged = nudgePickupSlotHours(slots[0]!, 1);
    expect(Date.parse(nudged) - Date.parse(slots[0]!)).toBe(3_600_000);
  });
});

describe('W034 refund ETA live clock', () => {
  it('labels live countdown and ledger celebration', () => {
    expect(
      refundEtaLiveLabel('2026-08-29T12:00:00.000Z', false, now),
    ).toMatch(/3 days left/i);
    expect(refundEtaLiveLabel(null, true, now)).toBe('Landed in ledger');
    expect(
      refundEtaLiveLabel('2026-08-20T12:00:00.000Z', false, now),
    ).toMatch(/overdue/i);
  });
});

describe('W035 mark-refunded celebration', () => {
  it('builds haptic toast copy with ledger hint', () => {
    const celeb = markRefundedCelebration({ refundMinor: 25_00 });
    expect(celeb.title).toBe('Refund landed');
    expect(celeb.body).toMatch(/₹|25|vault ledger/i);
    expect(celeb.showLedgerHint).toBe(true);
  });
});

describe('W032 merchant portal', () => {
  it('resolves portal URL and builds analytics props', async () => {
    const { merchantReturnUrl } = await import('@worn/shared');
    expect(merchantReturnUrl('Myntra')).toContain('myntra.com');
    expect(merchantReturnUrl('Unknown Boutique')).toBeNull();
    expect(
      returnPortalOpenProps('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Myntra'),
    ).toEqual({
      returnId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      merchant: 'Myntra',
    });
  });
});

describe('W036 size-map tip', () => {
  it('builds dismissible buy-this-size tip from brand aggregate', () => {
    const tip = buildSizeMapTip({
      brand: 'Zara',
      suggestedDelta: 1,
      sampleCount: 2,
      orderedSize: 'M',
    });
    expect(tip?.headline).toMatch(/runs small/i);
    expect(tip?.body).toMatch(/L|size up/i);
    expect(tip?.dismissKey).toBe('size-map-tip:zara');

    const brands: SizeMapBrandRow[] = [
      {
        brand: 'Myntra',
        sampleCount: 1,
        outcomes: { tooSmall: 0, tooBig: 1, keptOrOther: 0 },
        suggestedDelta: -1,
        history: [
          {
            returnId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            brand: 'Myntra',
            merchant: 'Myntra',
            itemTitle: 'Jeans',
            category: 'bottom',
            orderedSize: 'L',
            preferredSize: 'M',
            reason: 'TOO_BIG',
            returnedAt: '2026-08-01T00:00:00.000Z',
          },
        ],
      },
    ];
    const fromBrand = sizeMapTipForBrand(brands, 'Myntra');
    expect(fromBrand?.headline).toMatch(/Buy M next|runs large/i);
    expect(fromBrand?.dismissKey).toContain('size-map-tip');
  });
});

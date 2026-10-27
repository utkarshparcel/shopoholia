import { beforeEach, describe, expect, it, vi } from 'vitest';

const share = vi.fn(async (_opts?: unknown) => ({ action: 'sharedAction' }));

vi.mock('react-native', () => ({
  Share: {
    share: (opts?: { message?: string; title?: string }) => share(opts),
    sharedAction: 'sharedAction',
    dismissedAction: 'dismissedAction',
  },
}));

import {
  deadItemCount,
  formatNeverWornAmount,
  neverWornCostMinor,
  neverWornShareFromMetrics,
  redactBrandLabel,
  redactCardDigits,
  shareNeverWornCard,
  wearChallengeProgress,
} from './wasteMoney';

describe('wasteMoney formatters + redact', () => {
  it('formats never-worn amount', () => {
    expect(formatNeverWornAmount(40_000_00, 'INR')).toContain('₹');
    expect(formatNeverWornAmount(12_345, 'USD')).toContain('$');
  });

  it('redacts brands and card digits', () => {
    expect(redactBrandLabel('Myntra')).toBe('M••••a');
    expect(redactCardDigits('GC 4111 1111 1111 1111')).not.toMatch(/4111/);
    expect(redactBrandLabel('Card 5555-5555-5555-4444')).not.toMatch(/\d{4}/);
  });

  it('sums never-worn cost and counts dead', () => {
    const metrics = [
      { wearCount: 0, status: 'DEAD', item: { costMinor: 40_000_00, brand: 'Myntra' } },
      { wearCount: 2, status: 'ACTIVE', item: { costMinor: 1000, brand: 'Zara' } },
      { wearCount: 0, item: { costMinor: 500, brand: 'H&M' } },
    ];
    expect(neverWornCostMinor(metrics)).toBe(40_000_00 + 500);
    expect(deadItemCount(metrics)).toBe(2);
  });

  it('builds share card with blurred merchants and watermark', () => {
    const card = neverWornShareFromMetrics(
      [
        { wearCount: 0, item: { costMinor: 2_500_00, brand: 'Myntra' } },
        { wearCount: 0, item: { costMinor: 1_000_00, brand: 'Zara' } },
      ],
      { currency: 'INR' },
    );
    expect(card.headline).toMatch(/never worn/);
    expect(card.watermark).toBe('worn.app');
    expect(card.shareText).toContain('worn.app');
    expect(card.shareText).not.toMatch(/Myntra|Zara/);
    expect(card.blurredMerchants.every((m) => m.includes('•'))).toBe(true);
  });

  it('counts wear-3× progress 0 → 3', () => {
    expect(wearChallengeProgress(0, 'DEAD')).toMatchObject({
      progress: 0,
      target: 3,
      remaining: 3,
      eligible: true,
      completed: false,
    });
    expect(wearChallengeProgress(3, 'ACTIVE')).toMatchObject({
      progress: 3,
      completed: true,
      eligible: false,
    });
  });
});

describe('shareNeverWornCard', () => {
  beforeEach(() => {
    share.mockClear();
    share.mockResolvedValue({ action: 'sharedAction' });
  });

  it('opens share sheet with shareText', async () => {
    const card = neverWornShareFromMetrics([
      { wearCount: 0, item: { costMinor: 1000, brand: 'Myntra' } },
    ]);
    const result = await shareNeverWornCard(card);
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        message: card.shareText,
        title: card.headline,
      }),
    );
    expect(result.shared).toBe(true);
  });
});

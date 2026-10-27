import { describe, expect, it } from 'vitest';
import {
  askFriendOptionsFromLooks,
  returnPollItemLabel,
} from './socialPolls';
import { familyFoundMoneyShareFromAccounts } from './foundMoney';

describe('familyFoundMoneyShareFromAccounts (N36)', () => {
  it('includes referral deep link in share text', () => {
    const card = familyFoundMoneyShareFromAccounts(
      [{ merchant: 'Myntra', balanceCacheMinor: 50_000 }],
      'HOME99',
    );
    expect(card.deepLink).toBe('https://worn.app/r/HOME99');
    expect(card.shareText).toContain(card.deepLink);
    expect(card.shareText).not.toMatch(/Myntra/);
  });
});

describe('social poll mobile helpers', () => {
  it('returnPollItemLabel prefers title', () => {
    expect(returnPollItemLabel({ itemTitle: 'Blue shirt', merchant: 'Zara' })).toBe(
      'Blue shirt',
    );
    expect(returnPollItemLabel({ merchant: 'Zara' })).toMatch(/Z••••/);
  });

  it('askFriendOptionsFromLooks builds A/B/C labels', () => {
    const opts = askFriendOptionsFromLooks([
      { itemIds: ['1'], categories: ['TOP', 'BOTTOM'] },
      { id: 'b', itemIds: ['2'], categories: ['DRESS'] },
    ]);
    expect(opts).toHaveLength(2);
    expect(opts[0]!.label).toMatch(/Look A/);
    expect(opts[1]!.id).toBe('b');
  });
});

import { describe, expect, it } from 'vitest';

import { isRefundLedgerEntry, refundLedgerEntries } from './refundLedger';

describe('refundLedger', () => {
  it('recognizes REFUND money_ledger descriptions from accountant', () => {
    expect(isRefundLedgerEntry({ description: 'REFUND return.refund', kind: 'LEDGER' })).toBe(true);
    expect(isRefundLedgerEntry({ description: 'REFUND', kind: 'LEDGER' })).toBe(true);
    expect(isRefundLedgerEntry({ description: 'DEPOSIT gift', kind: 'LEDGER' })).toBe(false);
    expect(isRefundLedgerEntry({ description: 'Amazon purchase', kind: 'PURCHASE' })).toBe(false);
  });

  it('filters refund rows for Vault Returns tab', () => {
    const entries = [
      {
        id: '1',
        kind: 'LEDGER',
        description: 'REFUND return.refund',
        amountMinor: 2500,
        createdAt: '2026-01-10T00:00:00.000Z',
        refId: 'ret-1',
      },
      {
        id: '2',
        kind: 'PURCHASE',
        description: 'Myntra purchase',
        amountMinor: -5000,
        createdAt: '2026-01-09T00:00:00.000Z',
        refId: 'p-1',
      },
    ];
    const refunds = refundLedgerEntries(entries);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.amountMinor).toBe(2500);
  });
});

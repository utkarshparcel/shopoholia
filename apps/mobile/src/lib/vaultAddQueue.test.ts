import { beforeEach, describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  enqueueVaultAdd,
  flushVaultAddQueue,
  queuedAddAsPendingAccount,
  readVaultAddQueue,
  writeVaultAddQueue,
  VAULT_ADD_QUEUE_KEY,
} from './vaultAddQueue';

describe('vaultAddQueue (W002-OFFLINE-VAULT-ADD)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('enqueues with stable idempotency id', async () => {
    const item = await enqueueVaultAdd({
      kind: 'GIFT_CARD',
      merchant: 'Amazon',
      currency: 'INR',
      balanceMinor: 12_00,
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
    });
    expect(item.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(item.body.idempotencyKey).toBe(item.id);
    const snap = await readVaultAddQueue();
    expect(snap.items).toHaveLength(1);
  });

  it('flush is idempotent and clears queue on success', async () => {
    await enqueueVaultAdd({
      kind: 'GIFT_CARD',
      merchant: 'Myntra',
      currency: 'INR',
      balanceMinor: 50_000,
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
    });
    const addCredit = vi.fn(async (_body: { idempotencyKey?: string }) => ({ id: 'acct' }));
    const snap = await flushVaultAddQueue(addCredit);
    expect(addCredit).toHaveBeenCalledTimes(1);
    expect(addCredit.mock.calls[0]![0].idempotencyKey).toBe(
      '22222222-2222-4222-8222-222222222222',
    );
    expect(snap.items).toHaveLength(0);
    expect(snap.lastFlushError).toBeNull();
  });

  it('keeps items and sets error banner message on flush failure', async () => {
    await enqueueVaultAdd({
      kind: 'GIFT_CARD',
      merchant: 'Nykaa',
      currency: 'INR',
      balanceMinor: 9_00,
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    });
    const snap = await flushVaultAddQueue(async () => {
      throw new Error('network down');
    });
    expect(snap.items).toHaveLength(1);
    expect(snap.lastFlushError).toBe('network down');
  });

  it('maps queued row to pending vault account', async () => {
    await writeVaultAddQueue({
      items: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          body: {
            kind: 'GIFT_CARD',
            merchant: 'Flipkart',
            currency: 'USD',
            balanceMinor: 25_00,
            idempotencyKey: '44444444-4444-4444-8444-444444444444',
          },
          createdAt: 1,
        },
      ],
      lastFlushError: null,
    });
    const snap = await readVaultAddQueue();
    const pending = queuedAddAsPendingAccount(snap.items[0]!);
    expect(pending.pendingSync).toBe(true);
    expect(pending.merchant).toBe('Flipkart');
    expect(pending.currency).toBe('USD');
    const raw = await AsyncStorage.getItem(VAULT_ADD_QUEUE_KEY);
    expect(raw).toContain('Flipkart');
  });
});

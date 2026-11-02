import { beforeEach, describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearVaultAddQueue,
  enqueueVaultAdd,
  flushVaultAddQueue,
  queuedAddAsPendingAccount,
  readVaultAddQueue,
  VAULT_ADD_QUEUE_KEY,
} from './vaultAddQueue';

const ALICE = 'user-alice';
const BOB = 'user-bob';

describe('vaultAddQueue (W002-OFFLINE-VAULT-ADD)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('enqueues with stable idempotency id', async () => {
    const item = await enqueueVaultAdd(ALICE, {
      kind: 'GIFT_CARD',
      merchant: 'Amazon',
      currency: 'INR',
      balanceMinor: 12_00,
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
    });
    expect(item.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(item.body.idempotencyKey).toBe(item.id);
    const snap = await readVaultAddQueue(ALICE);
    expect(snap.items).toHaveLength(1);
  });

  it('flush is idempotent and clears queue on success', async () => {
    await enqueueVaultAdd(ALICE, {
      kind: 'GIFT_CARD',
      merchant: 'Myntra',
      currency: 'INR',
      balanceMinor: 50_000,
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
    });
    const addCredit = vi.fn(async (_body: { idempotencyKey?: string }) => ({ id: 'acct' }));
    const snap = await flushVaultAddQueue(ALICE, addCredit);
    expect(addCredit).toHaveBeenCalledTimes(1);
    expect(addCredit.mock.calls[0]![0].idempotencyKey).toBe(
      '22222222-2222-4222-8222-222222222222',
    );
    expect(snap.items).toHaveLength(0);
    expect(snap.lastFlushError).toBeNull();
  });

  it('keeps items and sets error banner message on flush failure', async () => {
    await enqueueVaultAdd(ALICE, {
      kind: 'GIFT_CARD',
      merchant: 'Nykaa',
      currency: 'INR',
      balanceMinor: 9_00,
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    });
    const snap = await flushVaultAddQueue(ALICE, async () => {
      throw new Error('network down');
    });
    expect(snap.items).toHaveLength(1);
    expect(snap.lastFlushError).toBe('network down');
  });

  it('maps queued row to pending vault account', async () => {
    await enqueueVaultAdd(ALICE, {
      kind: 'GIFT_CARD',
      merchant: 'Flipkart',
      currency: 'USD',
      balanceMinor: 25_00,
      idempotencyKey: '44444444-4444-4444-8444-444444444444',
    });
    const snap = await readVaultAddQueue(ALICE);
    const pending = queuedAddAsPendingAccount(snap.items[0]!);
    expect(pending.pendingSync).toBe(true);
    expect(pending.merchant).toBe('Flipkart');
    expect(pending.currency).toBe('USD');
    const raw = await AsyncStorage.getItem(VAULT_ADD_QUEUE_KEY);
    expect(raw).toContain('Flipkart');
  });

  it("flushes only the signed-in user's adds and shows no one else's", async () => {
    await enqueueVaultAdd(ALICE, {
      kind: 'GIFT_CARD',
      merchant: 'Amazon',
      currency: 'INR',
      balanceMinor: 10_00,
      idempotencyKey: '55555555-5555-4555-8555-555555555555',
    });
    await enqueueVaultAdd(BOB, {
      kind: 'GIFT_CARD',
      merchant: 'Ajio',
      currency: 'INR',
      balanceMinor: 20_00,
      idempotencyKey: '66666666-6666-4666-8666-666666666666',
    });
    expect((await readVaultAddQueue(BOB)).items.map((i) => i.body.merchant)).toEqual(['Ajio']);
    expect((await readVaultAddQueue(null)).items).toHaveLength(0);

    const bobAdd = vi.fn(async (_body: { merchant: string }) => ({ id: 'acct' }));
    const bob = await flushVaultAddQueue(BOB, bobAdd);
    expect(bobAdd.mock.calls.map((c) => c[0].merchant)).toEqual(['Ajio']);
    expect(bob.items).toHaveLength(0);
    // Alice's add waits for Alice's session.
    expect((await readVaultAddQueue(ALICE)).items.map((i) => i.body.merchant)).toEqual(['Amazon']);
  });

  it("keeps one user's flush error from another user's banner", async () => {
    await enqueueVaultAdd(ALICE, {
      kind: 'GIFT_CARD',
      merchant: 'Nykaa',
      currency: 'INR',
      balanceMinor: 9_00,
    });
    await flushVaultAddQueue(ALICE, async () => {
      throw new Error('network down');
    });
    expect((await readVaultAddQueue(ALICE)).lastFlushError).toBe('network down');
    expect((await readVaultAddQueue(BOB)).lastFlushError).toBeNull();
  });

  it('drops legacy entries saved without a user id', async () => {
    await AsyncStorage.setItem(
      VAULT_ADD_QUEUE_KEY,
      JSON.stringify({
        items: [
          {
            id: '77777777-7777-4777-8777-777777777777',
            body: { kind: 'GIFT_CARD', merchant: 'Legacy', balanceMinor: 1_00 },
            createdAt: 1,
          },
        ],
        lastFlushError: 'old',
      }),
    );
    const addCredit = vi.fn(async () => ({ id: 'acct' }));
    const snap = await flushVaultAddQueue(ALICE, addCredit);
    expect(addCredit).not.toHaveBeenCalled();
    expect(snap).toEqual({ items: [], lastFlushError: null });
  });

  it('clears every queued add', async () => {
    await enqueueVaultAdd(ALICE, { kind: 'GIFT_CARD', merchant: 'Amazon', balanceMinor: 1_00 });
    await enqueueVaultAdd(BOB, { kind: 'GIFT_CARD', merchant: 'Ajio', balanceMinor: 1_00 });
    await clearVaultAddQueue();
    expect(await AsyncStorage.getItem(VAULT_ADD_QUEUE_KEY)).toBeNull();
    expect((await readVaultAddQueue(ALICE)).items).toHaveLength(0);
  });
});

import type { EntitlementSnapshot } from '@worn/shared';

import { PurchaseApiError, type CoinsConfirmed } from './api';
import type { PurchaseKind, StoreTransaction } from './types';

/**
 * Paid store transactions the server hasn't confirmed yet. Each one is saved before it is sent
 * to the server, so a payment survives going offline, a 5xx or the app being killed, and it is
 * retried with backoff while the app is open, on the next start and whenever the app comes back
 * to the foreground. The server credits a transaction once however often it is sent. The store
 * transaction is finished only on the server's final answer (200, 409, 400, a 402 verdict), so the
 * store keeps re-delivering it until then.
 */

export type { PurchaseKind };

/** Why an entry is still waiting; it decides when to try again. */
export type WaitReason = 'retry' | 'unavailable' | 'pending';

export type UnconfirmedPurchase = StoreTransaction & {
  /** The Worn user who paid; entries are only ever sent with that user's session. */
  userId: string;
  kind: PurchaseKind;
  addedAt: number;
  attempts: number;
  lastFailure?: WaitReason;
  /** 429: not before this time (epoch ms). */
  notBefore?: number;
};

export type ConfirmResult =
  | {
      status: 'confirmed';
      entry: UnconfirmedPurchase;
      coins?: CoinsConfirmed;
      snapshot?: EntitlementSnapshot;
    }
  /** Belongs to another Worn account (409). Finished; never retried. */
  | { status: 'conflict'; entry: UnconfirmedPurchase }
  /** Refunded before it was credited (402 purchase_refunded). Finished; nothing was added. */
  | { status: 'refunded'; entry: UnconfirmedPurchase }
  /**
   * The server's verdict is no (400, or 402 purchase_not_found / product_mismatch / invalid_proof /
   * subscription_inactive). Finished and dropped; never retried.
   */
  | { status: 'rejected'; entry: UnconfirmedPurchase; httpStatus: number | null; code: string | null }
  /** Kept for a later retry. */
  | { status: 'waiting'; entry: UnconfirmedPurchase; reason: WaitReason };

export type QueueStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export type PurchaseQueueDeps = {
  storage: QueueStorage;
  validateCoins: (transaction: StoreTransaction) => Promise<CoinsConfirmed>;
  syncSubscription: (transaction: StoreTransaction) => Promise<EntitlementSnapshot>;
  /** Finishes the store transaction; called only on a final answer from the server. */
  finish: (transaction: StoreTransaction, kind: PurchaseKind) => Promise<void>;
  now?: () => number;
};

export const PURCHASE_QUEUE_KEY = 'worn.purchases.unconfirmed.v1';

const RETRY_FIRST_MS = 5_000;
const RETRY_MAX_MS = 5 * 60_000;

/**
 * When to send a waiting entry again while the app stays open; null waits for the store's listener
 * or the next launch / foreground. 503, 5xx, 429, offline: 5 s doubling, capped at 5 minutes, and
 * never before a 429's `retry-after`. 402 purchase_pending: wait for the store.
 */
export function retryDelayMs(
  entry: Pick<UnconfirmedPurchase, 'attempts' | 'lastFailure' | 'notBefore'>,
  now: number = Date.now(),
): number | null {
  if (entry.attempts === 0 || !entry.lastFailure) return 0;
  if (entry.lastFailure === 'pending') return null;
  const backoff = Math.min(RETRY_FIRST_MS * 2 ** (entry.attempts - 1), RETRY_MAX_MS);
  return Math.max(backoff, (entry.notBefore ?? 0) - now);
}

function keyOf(t: Pick<StoreTransaction, 'store' | 'transactionId'>): string {
  return `${t.store}|${t.transactionId}`;
}

function isEntry(value: unknown): value is UnconfirmedPurchase {
  const v = value as Partial<UnconfirmedPurchase> | null;
  return (
    (v?.store === 'app_store' || v?.store === 'play_store') &&
    typeof v.productId === 'string' &&
    typeof v.transactionId === 'string' &&
    (typeof v.proof === 'string' || v.proof === null) &&
    typeof v.userId === 'string' &&
    (v.kind === 'coins' || v.kind === 'subscription') &&
    typeof v.addedAt === 'number' &&
    typeof v.attempts === 'number'
  );
}

export function createPurchaseQueue(deps: PurchaseQueueDeps) {
  const now = deps.now ?? Date.now;
  let entries: UnconfirmedPurchase[] | null = null;
  let loading: Promise<UnconfirmedPurchase[]> | null = null;
  // Every read-modify-write goes through this chain, so concurrent changes never drop an entry.
  let writes: Promise<unknown> = Promise.resolve();
  const confirming = new Map<string, Promise<ConfirmResult>>();
  const draining = new Map<string, Promise<ConfirmResult[]>>();
  const resultListeners = new Set<(result: ConfirmResult) => void>();
  const changeListeners = new Set<() => void>();

  function load(): Promise<UnconfirmedPurchase[]> {
    if (entries) return Promise.resolve(entries);
    loading ??= deps.storage
      .getItem(PURCHASE_QUEUE_KEY)
      .then((raw) => {
        let parsed: unknown = [];
        try {
          parsed = raw ? JSON.parse(raw) : [];
        } catch {
          parsed = [];
        }
        entries = Array.isArray(parsed) ? parsed.filter(isEntry) : [];
        return entries;
      })
      .catch(() => {
        entries = [];
        return entries;
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  function update<T>(change: (current: UnconfirmedPurchase[]) => { next: UnconfirmedPurchase[]; value: T }) {
    const run = writes.then(async () => {
      const current = await load();
      const { next, value } = change(current);
      if (next !== current) {
        entries = next;
        await deps.storage.setItem(PURCHASE_QUEUE_KEY, JSON.stringify(next));
        for (const listener of changeListeners) listener();
      }
      return value;
    });
    writes = run.catch(() => undefined);
    return run;
  }

  async function list(userId?: string): Promise<UnconfirmedPurchase[]> {
    await writes;
    const current = await load();
    return userId ? current.filter((e) => e.userId === userId) : [...current];
  }

  /** Saves a paid transaction for `userId`. The same transaction twice is stored once. */
  function add(
    transaction: StoreTransaction,
    userId: string,
    kind: PurchaseKind,
  ): Promise<UnconfirmedPurchase> {
    return update((current) => {
      const existing = current.find((e) => keyOf(e) === keyOf(transaction));
      if (existing) {
        // The store handed it over again: keep the entry, with the store's latest proof.
        if (!transaction.proof || transaction.proof === existing.proof) return { next: current, value: existing };
        const refreshed = { ...existing, proof: transaction.proof };
        return { next: current.map((e) => (e === existing ? refreshed : e)), value: refreshed };
      }
      const entry: UnconfirmedPurchase = {
        store: transaction.store,
        productId: transaction.productId,
        transactionId: transaction.transactionId,
        proof: transaction.proof,
        userId,
        kind,
        addedAt: now(),
        attempts: 0,
      };
      return { next: [...current, entry], value: entry };
    });
  }

  function remove(entry: UnconfirmedPurchase) {
    return update((current) => {
      const next = current.filter((e) => keyOf(e) !== keyOf(entry));
      return { next: next.length === current.length ? current : next, value: undefined };
    });
  }

  function countAttempt(entry: UnconfirmedPurchase, reason: WaitReason, retryAfterMs: number | null) {
    const counted = (e: UnconfirmedPurchase): UnconfirmedPurchase => {
      const { notBefore: _previous, ...rest } = e;
      return {
        ...rest,
        attempts: e.attempts + 1,
        lastFailure: reason,
        ...(retryAfterMs ? { notBefore: now() + retryAfterMs } : {}),
      };
    };
    return update((current) => {
      let found = counted(entry);
      const next = current.map((e) => {
        if (keyOf(e) !== keyOf(entry)) return e;
        found = counted(e);
        return found;
      });
      return { next, value: found };
    });
  }

  /**
   * On a final answer: removes the entry and finishes the store transaction. If either fails, the
   * store re-delivers it and the server answers the same again.
   */
  async function settle(entry: UnconfirmedPurchase) {
    await remove(entry).catch(() => undefined);
    await deps.finish(entry, entry.kind).catch(() => undefined);
  }

  async function send(entry: UnconfirmedPurchase): Promise<ConfirmResult> {
    let confirmed: { coins?: CoinsConfirmed; snapshot?: EntitlementSnapshot };
    try {
      confirmed =
        entry.kind === 'coins'
          ? { coins: await deps.validateCoins(entry) }
          : { snapshot: await deps.syncSubscription(entry) };
    } catch (error) {
      const apiError = error instanceof PurchaseApiError ? error : null;
      const failure = apiError?.failure ?? 'retry';
      switch (failure) {
        case 'conflict':
        case 'refunded':
          await settle(entry);
          return { status: failure, entry };
        case 'rejected':
          await settle(entry);
          return { status: 'rejected', entry, httpStatus: apiError?.status ?? null, code: apiError?.code ?? null };
        default: {
          const counted = await countAttempt(entry, failure, apiError?.retryAfterMs ?? null).catch(() => entry);
          return { status: 'waiting', entry: counted, reason: failure };
        }
      }
    }
    await settle(entry);
    return { status: 'confirmed', entry, ...confirmed };
  }

  /** Sends one saved transaction to the server. Concurrent calls for it share one request. */
  function confirm(entry: UnconfirmedPurchase): Promise<ConfirmResult> {
    const key = keyOf(entry);
    let pending = confirming.get(key);
    if (!pending) {
      pending = send(entry)
        .then((result) => {
          for (const listener of resultListeners) listener(result);
          return result;
        })
        .finally(() => confirming.delete(key));
      confirming.set(key, pending);
    }
    return pending;
  }

  /** Retries every saved transaction of `userId`, one at a time. One drain per user at once. */
  function drain(userId: string): Promise<ConfirmResult[]> {
    let pending = draining.get(userId);
    if (!pending) {
      pending = (async () => {
        const results: ConfirmResult[] = [];
        for (const entry of await list(userId)) {
          results.push(await confirm(entry));
        }
        return results;
      })().finally(() => draining.delete(userId));
      draining.set(userId, pending);
    }
    return pending;
  }

  /** The soonest backoff among `userId`'s waiting entries, or null when none should retry now. */
  async function nextRetryDelay(userId: string): Promise<number | null> {
    const at = now();
    const delays = (await list(userId))
      .map((entry) => retryDelayMs(entry, at))
      .filter((d): d is number => d !== null);
    return delays.length > 0 ? Math.min(...delays) : null;
  }

  return {
    add,
    confirm,
    drain,
    list,
    nextRetryDelay,
    /** Every confirm result, including background retries. Returns the unsubscribe. */
    onResult(listener: (result: ConfirmResult) => void): () => void {
      resultListeners.add(listener);
      return () => resultListeners.delete(listener);
    },
    /** Called after the saved list changed. Returns the unsubscribe. */
    onChange(listener: () => void): () => void {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
  };
}

export type PurchaseQueue = ReturnType<typeof createPurchaseQueue>;

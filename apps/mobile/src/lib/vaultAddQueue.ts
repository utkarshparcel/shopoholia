/**
 * W002 — offline vault gift-card add queue.
 * Enqueue while offline; flush with stable idempotency when online.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AddCreditBody } from '@worn/shared';

export const VAULT_ADD_QUEUE_KEY = 'worn-vault-add-queue' as const;

export type QueuedVaultAdd = {
  /** Stable UUID used as POST /credits idempotencyKey. */
  id: string;
  body: AddCreditBody;
  createdAt: number;
};

export type VaultAddQueueSnapshot = {
  items: QueuedVaultAdd[];
  /** Last flush error message (cleared on success). */
  lastFlushError: string | null;
};

type AddCreditFn = (body: AddCreditBody) => Promise<unknown>;

function newQueueId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
}

function emptySnapshot(): VaultAddQueueSnapshot {
  return { items: [], lastFlushError: null };
}

export async function readVaultAddQueue(): Promise<VaultAddQueueSnapshot> {
  try {
    const raw = await AsyncStorage.getItem(VAULT_ADD_QUEUE_KEY);
    if (!raw) return emptySnapshot();
    const parsed = JSON.parse(raw) as Partial<VaultAddQueueSnapshot>;
    const items = Array.isArray(parsed.items)
      ? parsed.items.filter(
          (item): item is QueuedVaultAdd =>
            Boolean(item) &&
            typeof item === 'object' &&
            typeof (item as QueuedVaultAdd).id === 'string' &&
            typeof (item as QueuedVaultAdd).body === 'object' &&
            (item as QueuedVaultAdd).body != null,
        )
      : [];
    return {
      items,
      lastFlushError:
        typeof parsed.lastFlushError === 'string' ? parsed.lastFlushError : null,
    };
  } catch {
    return emptySnapshot();
  }
}

export async function writeVaultAddQueue(
  snapshot: VaultAddQueueSnapshot,
): Promise<void> {
  await AsyncStorage.setItem(VAULT_ADD_QUEUE_KEY, JSON.stringify(snapshot));
}

/** Queue a gift-card add for later sync. Returns the queued row (idempotent id). */
export async function enqueueVaultAdd(
  body: Omit<AddCreditBody, 'idempotencyKey'> & { idempotencyKey?: string },
  now = Date.now(),
): Promise<QueuedVaultAdd> {
  const snapshot = await readVaultAddQueue();
  const id = body.idempotencyKey ?? newQueueId();
  const existing = snapshot.items.find((item) => item.id === id);
  if (existing) return existing;

  const item: QueuedVaultAdd = {
    id,
    body: { ...body, idempotencyKey: id },
    createdAt: now,
  };
  snapshot.items = [...snapshot.items, item];
  snapshot.lastFlushError = null;
  await writeVaultAddQueue(snapshot);
  return item;
}

export async function clearVaultAddFlushError(): Promise<VaultAddQueueSnapshot> {
  const snapshot = await readVaultAddQueue();
  if (!snapshot.lastFlushError) return snapshot;
  const next = { ...snapshot, lastFlushError: null };
  await writeVaultAddQueue(next);
  return next;
}

/**
 * Flush queued adds. Each item uses its stored idempotencyKey so retries
 * are safe. Stops on first failure and stores an error banner message.
 */
export async function flushVaultAddQueue(
  addCredit: AddCreditFn,
): Promise<VaultAddQueueSnapshot> {
  const snapshot = await readVaultAddQueue();
  if (snapshot.items.length === 0) {
    if (snapshot.lastFlushError) {
      const cleared = { ...snapshot, lastFlushError: null };
      await writeVaultAddQueue(cleared);
      return cleared;
    }
    return snapshot;
  }

  const remaining: QueuedVaultAdd[] = [];
  let lastFlushError: string | null = null;

  for (const item of snapshot.items) {
    if (lastFlushError) {
      remaining.push(item);
      continue;
    }
    try {
      await addCredit({
        ...item.body,
        idempotencyKey: item.id,
      });
    } catch (err) {
      lastFlushError =
        err instanceof Error ? err.message : 'Could not sync offline gift card';
      remaining.push(item);
    }
  }

  const next: VaultAddQueueSnapshot = { items: remaining, lastFlushError };
  await writeVaultAddQueue(next);
  return next;
}

/** Optimistic local account shape for vault list while queued. */
export function queuedAddAsPendingAccount(item: QueuedVaultAdd): {
  id: string;
  userId: string;
  kind: AddCreditBody['kind'];
  merchant: string;
  currency: string;
  balanceCacheMinor: number;
  expiresAt: string | null;
  status: 'ACTIVE';
  pendingSync: true;
} {
  return {
    id: item.id,
    userId: 'pending-local',
    kind: item.body.kind,
    merchant: item.body.merchant,
    currency: item.body.currency ?? 'INR',
    balanceCacheMinor: item.body.balanceMinor,
    expiresAt: item.body.expiresAt ?? null,
    status: 'ACTIVE',
    pendingSync: true,
  };
}

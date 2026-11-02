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
  /** The Worn user who added it; entries are only ever sent with that user's session. */
  userId: string;
  body: AddCreditBody;
  createdAt: number;
};

/** One user's view of the queue. */
export type VaultAddQueueSnapshot = {
  items: QueuedVaultAdd[];
  /** Last flush error message (cleared on success). */
  lastFlushError: string | null;
};

/** What is saved: every user's entries, and each user's last flush error. */
type StoredVaultAddQueue = {
  items: QueuedVaultAdd[];
  flushErrors: Record<string, string>;
};

type AddCreditFn = (body: AddCreditBody) => Promise<unknown>;

function newQueueId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
}

function isQueuedAdd(item: unknown): item is QueuedVaultAdd {
  const v = item as Partial<QueuedVaultAdd> | null;
  return (
    Boolean(v) &&
    typeof v === 'object' &&
    typeof v!.id === 'string' &&
    typeof v!.userId === 'string' &&
    v!.userId !== '' &&
    typeof v!.body === 'object' &&
    v!.body != null
  );
}

/**
 * Entries an older build saved carry no user id: there's no telling whose they are, so they're
 * dropped rather than sent with whoever is signed in now.
 */
async function readStored(): Promise<StoredVaultAddQueue> {
  try {
    const raw = await AsyncStorage.getItem(VAULT_ADD_QUEUE_KEY);
    if (!raw) return { items: [], flushErrors: {} };
    const parsed = JSON.parse(raw) as Partial<StoredVaultAddQueue> | null;
    const items = Array.isArray(parsed?.items) ? parsed.items.filter(isQueuedAdd) : [];
    const flushErrors: Record<string, string> = {};
    if (parsed?.flushErrors && typeof parsed.flushErrors === 'object') {
      for (const [userId, message] of Object.entries(parsed.flushErrors)) {
        if (typeof message === 'string') flushErrors[userId] = message;
      }
    }
    return { items, flushErrors };
  } catch {
    return { items: [], flushErrors: {} };
  }
}

async function writeStored(stored: StoredVaultAddQueue): Promise<void> {
  await AsyncStorage.setItem(VAULT_ADD_QUEUE_KEY, JSON.stringify(stored));
}

function snapshotFor(stored: StoredVaultAddQueue, userId: string): VaultAddQueueSnapshot {
  return {
    items: stored.items.filter((item) => item.userId === userId),
    lastFlushError: stored.flushErrors[userId] ?? null,
  };
}

function withFlushError(
  flushErrors: Record<string, string>,
  userId: string,
  message: string | null,
): Record<string, string> {
  const { [userId]: _previous, ...rest } = flushErrors;
  return message ? { ...rest, [userId]: message } : rest;
}

/** `userId`'s queued adds; signed out (null) sees none. */
export async function readVaultAddQueue(userId: string | null): Promise<VaultAddQueueSnapshot> {
  if (!userId) return { items: [], lastFlushError: null };
  return snapshotFor(await readStored(), userId);
}

/** Queue a gift-card add by `userId` for later sync. Returns the queued row (idempotent id). */
export async function enqueueVaultAdd(
  userId: string,
  body: Omit<AddCreditBody, 'idempotencyKey'> & { idempotencyKey?: string },
  now = Date.now(),
): Promise<QueuedVaultAdd> {
  const stored = await readStored();
  const id = body.idempotencyKey ?? newQueueId();
  const existing = stored.items.find((item) => item.id === id && item.userId === userId);
  if (existing) return existing;

  const item: QueuedVaultAdd = {
    id,
    userId,
    body: { ...body, idempotencyKey: id },
    createdAt: now,
  };
  await writeStored({
    items: [...stored.items, item],
    flushErrors: withFlushError(stored.flushErrors, userId, null),
  });
  return item;
}

export async function clearVaultAddFlushError(userId: string): Promise<VaultAddQueueSnapshot> {
  const stored = await readStored();
  if (!stored.flushErrors[userId]) return snapshotFor(stored, userId);
  const next = { ...stored, flushErrors: withFlushError(stored.flushErrors, userId, null) };
  await writeStored(next);
  return snapshotFor(next, userId);
}

/**
 * Flush `userId`'s queued adds with that user's session (`addCredit`); other users' entries are
 * left alone. Each item uses its stored idempotencyKey so retries are safe. Stops on first failure
 * and stores an error banner message.
 */
export async function flushVaultAddQueue(
  userId: string,
  addCredit: AddCreditFn,
): Promise<VaultAddQueueSnapshot> {
  const stored = await readStored();
  const mine = stored.items.filter((item) => item.userId === userId);
  if (mine.length === 0) {
    if (stored.flushErrors[userId]) {
      const cleared = { ...stored, flushErrors: withFlushError(stored.flushErrors, userId, null) };
      await writeStored(cleared);
      return snapshotFor(cleared, userId);
    }
    return snapshotFor(stored, userId);
  }

  const sentIds = new Set<string>();
  let lastFlushError: string | null = null;

  for (const item of mine) {
    try {
      await addCredit({
        ...item.body,
        idempotencyKey: item.id,
      });
      sentIds.add(item.id);
    } catch (err) {
      lastFlushError =
        err instanceof Error ? err.message : 'Could not sync offline gift card';
      break;
    }
  }

  // Re-read, so an add queued while this flush was sending isn't lost.
  const latest = await readStored();
  const next: StoredVaultAddQueue = {
    items: latest.items.filter((item) => !(item.userId === userId && sentIds.has(item.id))),
    flushErrors: withFlushError(latest.flushErrors, userId, lastFlushError),
  };
  await writeStored(next);
  return snapshotFor(next, userId);
}

/** Drops every queued add (sign-out, account deletion): nothing of a user is left to send. */
export async function clearVaultAddQueue(): Promise<void> {
  await AsyncStorage.removeItem(VAULT_ADD_QUEUE_KEY);
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

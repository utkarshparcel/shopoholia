import { randomUUID } from 'expo-crypto';

/**
 * A new idempotency key (a v4 UUID, which the API's `idempotencyKey` fields require).
 * Make one per user action and send the same key on every retry of that action,
 * so the server applies it once.
 */
export function newIdempotencyKey(): string {
  return randomUUID();
}

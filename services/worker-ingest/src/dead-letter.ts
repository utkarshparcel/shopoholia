import { INGEST_DEAD_LETTER_QUEUE } from "./queues.js";

// In-memory dead-letter store (used when Redis unavailable / in tests).
export type DeadLetterEntry = {
  kind: "EMAIL" | "SMS" | "RESYNC" | "OAUTH" | "UNKNOWN";
  sourceId?: string;
  documentId?: string;
  error: string;
  attempts: number;
  payload?: unknown;
  timestamp: string;
};

const inMemoryDLQ: DeadLetterEntry[] = [];

// Per-source exponential backoff state.
const backoffMap = new Map<string, { failures: number; lastFailureAt: number }>();

export function sendToDeadLetter(entry: Omit<DeadLetterEntry, "timestamp">): DeadLetterEntry {
  const full: DeadLetterEntry = { ...entry, timestamp: new Date().toISOString() };
  inMemoryDLQ.push(full);
  console.warn("[ingest] dead-letter", JSON.stringify(full));
  return full;
}

export function getDeadLetterCount(): number {
  return inMemoryDLQ.length;
}

export function listDeadLetters(): DeadLetterEntry[] {
  return [...inMemoryDLQ];
}

export function clearDeadLetters(): void {
  inMemoryDLQ.length = 0;
}

// BullMQ DLQ enqueue helper — best-effort. Requires Redis URL.
export async function enqueueDeadLetterJob(payload: DeadLetterEntry): Promise<void> {
  const redisUrl = process.env.REDIS_URL ?? process.env.INGEST_REDIS_URL;
  if (!redisUrl) return;
  try {
    const { Queue } = await import("bullmq");
    const q = new Queue(INGEST_DEAD_LETTER_QUEUE, { connection: redisUrl as unknown as never });
    await q.add("dead-letter", payload, { jobId: `dl:${Date.now()}:${Math.random().toString(36).slice(2, 8)}` });
    await q.close();
  } catch {
    // best-effort
  }
}

// Exponential backoff helpers — per ingestion_sources.id
export function recordFailure(sourceId: string): number {
  const cur = backoffMap.get(sourceId) ?? { failures: 0, lastFailureAt: 0 };
  const failures = cur.failures + 1;
  backoffMap.set(sourceId, { failures, lastFailureAt: Date.now() });
  return computeBackoffMs(failures);
}

export function recordSuccess(sourceId: string): void {
  backoffMap.delete(sourceId);
}

export function computeBackoffMs(failures: number): number {
  // base 2s, exponential, capped at 30 min
  const base = 2000;
  const ms = base * Math.pow(2, failures - 1);
  return Math.min(ms, 30 * 60 * 1000);
}

export function getBackoffDelay(sourceId: string): number {
  const cur = backoffMap.get(sourceId);
  if (!cur) return 0;
  const elapsed = Date.now() - cur.lastFailureAt;
  const needed = computeBackoffMs(cur.failures);
  return Math.max(0, needed - elapsed);
}

export function getBackoffState(): Record<string, { failures: number; delayMs: number }> {
  const out: Record<string, { failures: number; delayMs: number }> = {};
  for (const [k, v] of backoffMap) {
    out[k] = { failures: v.failures, delayMs: getBackoffDelay(k) };
  }
  return out;
}

export function clearBackoff(): void {
  backoffMap.clear();
}

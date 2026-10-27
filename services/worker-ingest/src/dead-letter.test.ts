import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearBackoff,
  clearDeadLetters,
  computeBackoffMs,
  enqueueDeadLetterJob,
  getBackoffDelay,
  getBackoffState,
  getDeadLetterCount,
  listDeadLetters,
  recordFailure,
  recordSuccess,
  sendToDeadLetter,
} from "./dead-letter.js";
import { INGEST_DEAD_LETTER_QUEUE } from "./queues.js";

describe("dead-letter queue", () => {
  afterEach(() => {
    clearDeadLetters();
    clearBackoff();
    delete process.env.REDIS_URL;
    delete process.env.INGEST_REDIS_URL;
    vi.restoreAllMocks();
  });

  it("defines dead-letter queue name", () => {
    expect(INGEST_DEAD_LETTER_QUEUE).toBe("ingest-dead-letter");
  });

  it("sends and lists dead letters", () => {
    clearDeadLetters();
    expect(getDeadLetterCount()).toBe(0);
    sendToDeadLetter({ kind: "EMAIL", error: "parse failed", attempts: 3, sourceId: "s1" });
    expect(getDeadLetterCount()).toBe(1);
    const list = listDeadLetters();
    expect(list[0]!.error).toBe("parse failed");
    clearDeadLetters();
    expect(getDeadLetterCount()).toBe(0);
  });

  it("enqueueDeadLetterJob no-ops without Redis URL", async () => {
    delete process.env.REDIS_URL;
    delete process.env.INGEST_REDIS_URL;
    await expect(
      enqueueDeadLetterJob({
        kind: "SMS",
        error: "boom",
        attempts: 1,
        timestamp: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();
  });

  it("enqueueDeadLetterJob best-effort when Queue construction fails", async () => {
    process.env.INGEST_REDIS_URL = "redis://localhost:6379";
    vi.doMock("bullmq", () => ({
      Queue: class {
        constructor() {
          throw new Error("no redis");
        }
      },
    }));
    await expect(
      enqueueDeadLetterJob({
        kind: "EMAIL",
        error: "x",
        attempts: 2,
        timestamp: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();
  });
});

describe("per-source exponential backoff", () => {
  afterEach(clearBackoff);

  it("computes exponential backoff capped at 30min", () => {
    expect(computeBackoffMs(1)).toBe(2000);
    expect(computeBackoffMs(2)).toBe(4000);
    expect(computeBackoffMs(3)).toBe(8000);
    expect(computeBackoffMs(10)).toBeLessThanOrEqual(30 * 60 * 1000);
    expect(computeBackoffMs(20)).toBe(30 * 60 * 1000);
  });

  it("records failures and successes per source", () => {
    clearBackoff();
    expect(getBackoffDelay("src-1")).toBe(0);
    recordFailure("src-1");
    const d1 = getBackoffDelay("src-1");
    expect(d1).toBeGreaterThan(0);
    expect(d1).toBeLessThanOrEqual(2000);
    recordFailure("src-1");
    const d2 = getBackoffDelay("src-1");
    expect(d2).toBeGreaterThan(d1);
    recordSuccess("src-1");
    expect(getBackoffDelay("src-1")).toBe(0);
    clearBackoff();
  });

  it("exposes getBackoffState snapshot", () => {
    clearBackoff();
    recordFailure("src-a");
    recordFailure("src-b");
    const state = getBackoffState();
    expect(state["src-a"]!.failures).toBe(1);
    expect(state["src-b"]!.failures).toBe(1);
    expect(state["src-a"]!.delayMs).toBeGreaterThanOrEqual(0);
  });
});

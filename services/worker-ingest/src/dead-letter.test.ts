import { afterEach, describe, expect, it, vi } from "vitest";
import { IngestDeadLetterJobSchema, deadLetterData, type DeadLetter } from "@worn/shared";
import {
  clearBackoff,
  computeBackoffMs,
  enqueueDeadLetterJob,
  getBackoffDelay,
  getBackoffState,
  recordFailure,
  recordSuccess,
  toIngestDeadLetter,
} from "./dead-letter.js";
import {
  INGEST_DEAD_LETTER_QUEUE,
  INGEST_JOB_NAME,
  INGEST_OAUTH_JOB_NAME,
  INGEST_RESYNC_JOB_NAME,
} from "./queues.js";

function failed(jobName: string, data: unknown, jobId = "ingest%3Adoc-1"): DeadLetter {
  return {
    queue: "ingest-email",
    jobId,
    jobName,
    data: deadLetterData(data),
    error: "Error: parse failed",
    attemptsMade: 3,
    failedAt: new Date("2026-08-26T10:00:00.000Z"),
  };
}

describe("dead-letter queue", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defines dead-letter queue name", () => {
    expect(INGEST_DEAD_LETTER_QUEUE).toBe("ingest-dead-letter");
  });

  it("keeps ids only: no message body, payload or OAuth code", () => {
    const email = toIngestDeadLetter(
      failed(INGEST_JOB_NAME, {
        kind: "EMAIL",
        documentId: "doc-1",
        sourceId: "src-1",
        message: { subject: "Your order", text: "Hi Priya" },
        payload: { body: "raw" },
      }),
    );
    expect(IngestDeadLetterJobSchema.parse(email)).toEqual({
      kind: "EMAIL",
      documentId: "doc-1",
      sourceId: "src-1",
      jobId: "ingest%3Adoc-1",
      error: "Error: parse failed",
      attempts: 3,
      timestamp: "2026-08-26T10:00:00.000Z",
    });

    const oauth = toIngestDeadLetter(failed(INGEST_OAUTH_JOB_NAME, { sourceId: "src-1", code: "4/0Ab-secret" }));
    expect(oauth.kind).toBe("OAUTH");
    expect(JSON.stringify(oauth)).not.toContain("secret");

    expect(toIngestDeadLetter(failed(INGEST_JOB_NAME, { kind: "SMS", documentId: "d" })).kind).toBe("SMS");
    expect(toIngestDeadLetter(failed(INGEST_RESYNC_JOB_NAME, { sourceId: "s" })).kind).toBe("RESYNC");
    expect(toIngestDeadLetter(failed("something-else", {})).kind).toBe("UNKNOWN");
  });

  it("bounds the error text", () => {
    const long = { ...failed(INGEST_JOB_NAME, {}), error: "x".repeat(5_000) };
    expect(toIngestDeadLetter(long).error).toHaveLength(1_000);
  });

  it("adds one message per failed job, under a stable id, and surfaces Redis failures", async () => {
    const add = vi.fn(async () => undefined);
    const entry = toIngestDeadLetter(failed(INGEST_JOB_NAME, { kind: "SMS", documentId: "doc-1" }));
    await enqueueDeadLetterJob({ add }, entry);
    await enqueueDeadLetterJob({ add }, entry);
    expect(add).toHaveBeenCalledTimes(2);
    expect(add.mock.calls[0]).toEqual(["dead-letter", entry, { jobId: "ingest-dl|ingest%253Adoc-1" }]);
    expect(add.mock.calls[1]![2]).toEqual(add.mock.calls[0]![2]);

    const down = vi.fn(async () => {
      throw new Error("Connection is closed.");
    });
    await expect(enqueueDeadLetterJob({ add: down }, entry)).rejects.toThrow(/Connection is closed/);
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

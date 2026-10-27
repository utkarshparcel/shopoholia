import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queueMocks = vi.hoisted(() => ({
  add: vi.fn(async () => ({})),
  close: vi.fn(async () => {}),
  failAdd: false,
}));

vi.mock("bullmq", () => ({
  Queue: class MockQueue {
    add(...args: unknown[]) {
      if (queueMocks.failAdd) return Promise.reject(new Error("enqueue failed"));
      return queueMocks.add(...args);
    }
    on() {
      return this;
    }
    close() {
      return queueMocks.close();
    }
  },
}));

import {
  _stableIngestJobId,
  _stableOauthJobId,
  publishIngestJob,
  publishOauthCompleteJob,
} from "./ingest-queue.js";
import { QueueUnavailableError, jobIdFrom } from "./queues/enqueue.js";

describe("ingest-queue idempotent jobId", () => {
  it("stable ingest jobId from documentId", () => {
    expect(_stableIngestJobId({ kind: "SMS", documentId: "doc-123" })).toBe(
      jobIdFrom("ingest:doc-123"),
    );
    expect(_stableIngestJobId({ kind: "EMAIL", documentId: "abc" })).toBe(jobIdFrom("ingest:abc"));
  });
  it("stable ingest jobId from messageId fallback", () => {
    expect(_stableIngestJobId({ kind: "EMAIL", message: { messageId: "mid-1" } as never })).toBe(
      jobIdFrom("ingest:msg:mid-1"),
    );
  });
  it("stable ingest jobId undefined when no id", () => {
    expect(_stableIngestJobId({ kind: "EMAIL" })).toBeUndefined();
  });
  it("jobIds never contain ':' (BullMQ rejects them)", () => {
    expect(_stableIngestJobId({ kind: "SMS", documentId: "doc-123" })).not.toContain(":");
    expect(_stableOauthJobId({ sourceId: "s1", code: "c", userId: "u1" })).not.toContain(":");
  });
  it("stable oauth jobId hashes code", () => {
    const a = _stableOauthJobId({ sourceId: "s1", code: "code123", userId: "u1" });
    const b = _stableOauthJobId({ sourceId: "s1", code: "code123", userId: "u1" });
    expect(a).toBe(b);
    expect(a).toContain("s1");
    expect(a).not.toContain("code123");
    const c = _stableOauthJobId({ sourceId: "s1", code: "different", userId: "u1" });
    expect(c).not.toBe(a);
  });
  it("oauth jobId different per sourceId", () => {
    const a = _stableOauthJobId({ sourceId: "s1", code: "code", userId: "u1" });
    const b = _stableOauthJobId({ sourceId: "s2", code: "code", userId: "u1" });
    expect(a).not.toBe(b);
  });
});

describe("publishIngestJob (Redis path)", () => {
  const originalRedis = process.env.REDIS_URL;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    queueMocks.add.mockClear();
    queueMocks.close.mockClear();
    queueMocks.failAdd = false;
  });

  afterEach(() => {
    if (originalRedis) process.env.REDIS_URL = originalRedis;
    else delete process.env.REDIS_URL;
  });

  it("skips when Redis is not configured (outside production)", async () => {
    expect(await publishIngestJob({ kind: "EMAIL", documentId: "doc-1" })).toBe("skipped");
    expect(queueMocks.add).not.toHaveBeenCalled();
  });

  it("publishes with stable document jobId", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    const result = await publishIngestJob({
      kind: "SMS",
      documentId: "doc-abc",
      userId: "user-1",
    });
    expect(result).toBe("published");
    expect(queueMocks.add).toHaveBeenCalledWith(
      "email-received",
      expect.objectContaining({ kind: "SMS", documentId: "doc-abc" }),
      expect.objectContaining({ jobId: jobIdFrom("ingest:doc-abc") }),
    );
  });

  it("uses the messageId jobId when there is no document", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    const result = await publishIngestJob({
      kind: "EMAIL",
      message: { messageId: "gmail-mid-9" },
    });
    expect(result).toBe("published");
    expect(queueMocks.add).toHaveBeenCalledWith(
      "email-received",
      expect.objectContaining({ kind: "EMAIL" }),
      expect.objectContaining({ jobId: jobIdFrom("ingest:msg:gmail-mid-9") }),
    );
  });

  it("publishes without jobId when payload has no id", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    const result = await publishIngestJob({ kind: "EMAIL" });
    expect(result).toBe("published");
    const opts = queueMocks.add.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(opts).not.toHaveProperty("jobId");
  });

  it("throws QueueUnavailableError when enqueue fails", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    queueMocks.failAdd = true;
    await expect(publishIngestJob({ kind: "EMAIL", documentId: "doc-x" })).rejects.toBeInstanceOf(
      QueueUnavailableError,
    );
  });
});

describe("publishOauthCompleteJob (Redis path)", () => {
  const originalRedis = process.env.REDIS_URL;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    queueMocks.add.mockClear();
    queueMocks.close.mockClear();
    queueMocks.failAdd = false;
  });

  afterEach(() => {
    if (originalRedis) process.env.REDIS_URL = originalRedis;
    else delete process.env.REDIS_URL;
  });

  it("skips when Redis is not configured", async () => {
    expect(
      await publishOauthCompleteJob({ sourceId: "s1", code: "auth-code", userId: "u1" }),
    ).toBe("skipped");
  });

  it("publishes oauth-complete with hashed stable jobId", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    const payload = { sourceId: "src-1", code: "oauth-code-xyz", userId: "user-9" };
    const result = await publishOauthCompleteJob(payload);
    expect(result).toBe("published");
    expect(queueMocks.add).toHaveBeenCalledWith(
      "email-oauth",
      payload,
      expect.objectContaining({ jobId: _stableOauthJobId(payload) }),
    );
  });

  it("throws QueueUnavailableError when enqueue fails", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    queueMocks.failAdd = true;
    await expect(
      publishOauthCompleteJob({ sourceId: "s1", code: "c", userId: "u1" }),
    ).rejects.toBeInstanceOf(QueueUnavailableError);
  });
});

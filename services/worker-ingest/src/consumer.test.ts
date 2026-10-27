import { describe, expect, it, vi } from "vitest";
import {
  createBullmqIngestWorker,
  createMemoryIngestWorker,
  INGEST_QUEUE,
  type IngestJob,
} from "./index.js";

describe("worker-ingest consumer", () => {
  it("registers the ingest queue name", () => {
    expect(INGEST_QUEUE).toBe("ingest-email");
  });

  it("runs in-memory jobs and is wired to the queue", async () => {
    const handler = vi.fn(async () => undefined);
    const worker = createMemoryIngestWorker(handler, { autoProcess: false });
    expect(worker.queue).toBe(INGEST_QUEUE);

    const job: IngestJob = {
      kind: "EMAIL",
      message: {
        messageId: "m1",
        from: "no-reply@amazon.in",
        to: "me@example.com",
        subject: "Your Amazon.in order",
        text: "Order #A1B2C3 total ₹1,299.00",
        receivedAt: new Date(0).toISOString(),
      },
    };

    await worker.start();
    await worker.enqueue(job, 0);
    await worker.flush();
    expect(handler).toHaveBeenCalledWith(job);
    await worker.stop();
  });

  it("exposes a BullMQ scaffold that needs Redis to start", async () => {
    expect(() => createBullmqIngestWorker()).toThrow(/REDIS_URL/);
    const worker = createBullmqIngestWorker({ redisUrl: "redis://localhost:6379" });
    expect(worker.worker.name).toBe(INGEST_QUEUE);
    await worker.stop();
  });
});

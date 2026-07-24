import { describe, expect, it, vi } from "vitest";
import { createBullmqOrderWorker, createMemoryOrderWorker } from "./index.js";

describe("worker-orders", () => {
  it("runs in-memory transitions", async () => {
    const handler = vi.fn(async () => undefined);
    const worker = createMemoryOrderWorker(handler, { autoProcess: false });
    await worker.start();
    await worker.enqueue({ orderId: "o1", targetState: "PACKED" }, 0);
    await worker.flush();
    expect(handler).toHaveBeenCalledWith({ orderId: "o1", targetState: "PACKED" });
    await worker.stop();
  });

  it("exposes BullMQ scaffold", async () => {
    const worker = createBullmqOrderWorker();
    await expect(worker.start()).resolves.toBeUndefined();
    await worker.stop();
  });
});

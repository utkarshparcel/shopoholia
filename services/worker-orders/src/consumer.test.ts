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

  it("refuses to start a BullMQ consumer it does not have", async () => {
    const worker = createBullmqOrderWorker();
    await expect(worker.start()).rejects.toThrow(/no BullMQ consumer/);
    await worker.stop();
  });
});

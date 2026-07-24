import { describe, expect, it } from "vitest";
import { createMemoryRenderWorker } from "./index.js";

describe("worker-render memory consumer", () => {
  it("enqueues delivered and render jobs", async () => {
    const delivered: string[] = [];
    const rendered: string[] = [];

    const worker = createMemoryRenderWorker(
      {
        delivered: async (job) => {
          delivered.push(job.orderId);
        },
        render: async (job) => {
          rendered.push(job.renderId);
        },
      },
      { autoProcess: false },
    );

    await worker.enqueueDelivered({ orderId: "order-1" });
    await worker.enqueueRender({ renderId: "render-1", orderId: "order-1" });
    await worker.flush();

    expect(delivered).toEqual(["order-1"]);
    expect(rendered).toEqual(["render-1"]);
  });
});

import { describe, expect, it } from "vitest";
import { createDefaultDeps } from "./deps.js";

describe("createDefaultDeps", () => {
  it("returns wired dependencies", async () => {
    const deps = await createDefaultDeps();
    expect(deps.repos).toBeDefined();
    expect(deps.storage).toBeDefined();
    expect(deps.renderProvider.name).toBeTruthy();
    expect(deps.jobQueue.enqueueAvatarProcessing).toBeTypeOf("function");
    expect(deps.jobQueue.enqueueTryonProcessing).toBeTypeOf("function");
    expect(deps.jobQueue.scheduleOrderLadder).toBeTypeOf("function");
    expect(deps.jobQueue.enqueueDeliveredRender).toBeTypeOf("function");
    expect(deps.jobQueue.enqueueRender).toBeTypeOf("function");
    expect(deps.push.send).toBeTypeOf("function");
    expect(deps.otp.sendOtp).toBeTypeOf("function");

    const page = await deps.repos.listListings({ limit: 50 });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items[0]?.houseModelRenderKey).toMatch(/^https?:\/\//);
    expect(page.items[0]?.houseModelRenderKey).not.toContain("picsum.photos");
  });

  it("accepts overrides", async () => {
    const base = await createDefaultDeps();
    const deps = await createDefaultDeps({ repos: base.repos });
    expect(deps.repos).toBe(base.repos);
  });
});

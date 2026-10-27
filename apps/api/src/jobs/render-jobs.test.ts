import { describe, expect, it } from "vitest";
import { PHOTO_DUMP_TRIAGE_UNDO_WINDOW_MS, type RenderProvider } from "@worn/shared";
import { createMockRenderProvider } from "../lib/render/provider.js";
import { createMemoryRepositories } from "../lib/repositories/memory.js";
import { createMockStorage } from "../lib/storage/r2.js";
import { handleFitPreview } from "./fit-preview.js";
import { handleWardrobeDiscardPurge } from "./wardrobe-discard-purge.js";
import { failWardrobeTryonJob, handleWardrobeTryon, RENDER_RETRY_AFTER_MS } from "./wardrobe-tryon.js";

const USER = "7a1c2b3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

function countingProvider(behaviour: { fail?: boolean; noBytes?: boolean } = {}) {
  const base = createMockRenderProvider();
  const calls = { tryOn: 0 };
  const provider: RenderProvider = {
    ...base,
    async tryOn(input) {
      calls.tryOn += 1;
      if (behaviour.fail) throw new Error("provider down");
      const out = await base.tryOn(input);
      return behaviour.noBytes ? { ...out, imageBytes: new Uint8Array() } : out;
    },
  };
  return { provider, calls };
}

async function setup(behaviour: { fail?: boolean; noBytes?: boolean } = {}) {
  const repos = createMemoryRepositories();
  const storage = createMockStorage();
  const { provider, calls } = countingProvider(behaviour);
  await repos.upsertAvatar({
    userId: USER,
    status: "READY",
    referenceImageKey: "references/u.jpg",
    sourceUploadKeys: ["uploads/u.jpg"],
    bodyMeta: {},
  });
  const item = await repos.createWardrobeItem({
    userId: USER,
    category: "kurta",
    imageKeys: ["wardrobe/k.jpg"],
    garmentImageKey: "wardrobe/k.jpg",
  });
  return { repos, storage, provider, calls, item, deps: { repos, storage, renderProvider: provider } };
}

describe("handleWardrobeTryon", () => {
  it("renders a claimed row once, into the user's key space; a second run is a no-op", async () => {
    const { repos, calls, item, deps } = await setup();
    await repos.claimWardrobeTryon({ userId: USER, wardrobeItemId: item.id, provider: "mock", staleBefore: new Date(0) });
    const job = { userId: USER, wardrobeItemId: item.id };
    await handleWardrobeTryon(job, deps);
    await handleWardrobeTryon(job, deps);
    const row = await repos.findWardrobeTryonPreview(USER, item.id);
    expect(row?.status).toBe("READY");
    expect(row?.imageKey).toBe(`u/${USER}/tryon/${item.id}.jpg`);
    expect(row?.imageKey).not.toBe(item.garmentImageKey);
    expect(calls.tryOn).toBe(1);
  });

  it("does nothing without a PROCESSING claim", async () => {
    const { repos, calls, item, deps } = await setup();
    await handleWardrobeTryon({ userId: USER, wardrobeItemId: item.id }, deps);
    expect(calls.tryOn).toBe(0);
    expect(await repos.findWardrobeTryonPreview(USER, item.id)).toBeNull();
  });

  it("stores a provider failure as FAILED with a retryAfter", async () => {
    const { repos, item, deps } = await setup({ fail: true });
    await repos.claimWardrobeTryon({ userId: USER, wardrobeItemId: item.id, provider: "mock", staleBefore: new Date(0) });
    const before = Date.now();
    await handleWardrobeTryon({ userId: USER, wardrobeItemId: item.id }, deps);
    const row = await repos.findWardrobeTryonPreview(USER, item.id);
    expect(row?.status).toBe("FAILED");
    expect(row?.imageKey).toBeNull();
    expect(row?.error).toMatch(/provider down/);
    expect(row!.retryAfter!.getTime()).toBeGreaterThanOrEqual(before + RENDER_RETRY_AFTER_MS);
  });

  it("treats an empty image as a failure, not READY", async () => {
    const { repos, item, deps } = await setup({ noBytes: true });
    await repos.claimWardrobeTryon({ userId: USER, wardrobeItemId: item.id, provider: "mock", staleBefore: new Date(0) });
    await handleWardrobeTryon({ userId: USER, wardrobeItemId: item.id }, deps);
    expect((await repos.findWardrobeTryonPreview(USER, item.id))?.status).toBe("FAILED");
  });

  it("throws on a storage error so the queue retries, leaving the claim PROCESSING", async () => {
    const { repos, storage, provider, item } = await setup();
    await repos.claimWardrobeTryon({ userId: USER, wardrobeItemId: item.id, provider: "mock", staleBefore: new Date(0) });
    const broken = {
      ...storage,
      async put() {
        throw new Error("r2 down");
      },
    };
    await expect(
      handleWardrobeTryon({ userId: USER, wardrobeItemId: item.id }, { repos, storage: broken, renderProvider: provider }),
    ).rejects.toThrow("r2 down");
    expect((await repos.findWardrobeTryonPreview(USER, item.id))?.status).toBe("PROCESSING");
  });

  it("after the queue gives up, the claim is stored FAILED; a finished row is left alone", async () => {
    const { repos, item } = await setup();
    await repos.claimWardrobeTryon({ userId: USER, wardrobeItemId: item.id, provider: "mock", staleBefore: new Date(0) });
    await failWardrobeTryonJob({ userId: USER, wardrobeItemId: item.id }, { repos }, "storage down");
    const row = await repos.findWardrobeTryonPreview(USER, item.id);
    expect(row).toMatchObject({ status: "FAILED", error: "storage down" });
    await failWardrobeTryonJob({ userId: USER, wardrobeItemId: item.id }, { repos }, "again");
    expect((await repos.findWardrobeTryonPreview(USER, item.id))?.error).toBe("storage down");
  });

  it("rejects a malformed payload", async () => {
    const { deps } = await setup();
    await expect(handleWardrobeTryon({ userId: "nope" }, deps)).rejects.toThrow();
  });
});

describe("handleFitPreview", () => {
  it("renders READY under the user's keys, and FAILED on a provider error", async () => {
    for (const fail of [false, true]) {
      const { repos, deps, calls } = await setup({ fail });
      const { preview } = await repos.claimFitPreview({
        userId: USER,
        templateId: "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e",
        selectionsKey: "k",
        garmentKey: "fit/preview/t.jpg",
        provider: "mock",
        staleBefore: new Date(0),
      });
      await handleFitPreview({ userId: USER, previewId: preview.id }, deps);
      await handleFitPreview({ userId: USER, previewId: preview.id }, deps);
      const row = await repos.findFitPreview(preview.id, USER);
      expect(calls.tryOn).toBe(1);
      if (fail) {
        expect(row?.status).toBe("FAILED");
        expect(row?.retryAfter).toBeTruthy();
      } else {
        expect(row?.status).toBe("READY");
        expect(row?.imageKey).toBe(`u/${USER}/fit-preview/${preview.id}.jpg`);
      }
    }
  });
});

describe("handleWardrobeDiscardPurge", () => {
  it("deletes only an item still discarded after the undo window", async () => {
    const repos = createMemoryRepositories();
    const make = () => repos.createWardrobeItem({ userId: USER, category: "tee", imageKeys: [] });
    const fresh = await make();
    const old = await make();
    const restored = await make();
    for (const it of [fresh, old, restored]) await repos.discardWardrobeItem(it.id, USER);
    await repos.restoreWardrobeItem(restored.id, USER, new Date(0));

    const realNow = Date.now;
    try {
      // Pretend the window has passed for `old` only by running the job "later" for it.
      Date.now = () => realNow() + PHOTO_DUMP_TRIAGE_UNDO_WINDOW_MS + 1_000;
      await handleWardrobeDiscardPurge({ userId: USER, wardrobeItemId: old.id }, { repos });
      await handleWardrobeDiscardPurge({ userId: USER, wardrobeItemId: restored.id }, { repos });
      await handleWardrobeDiscardPurge({ userId: USER, wardrobeItemId: old.id }, { repos });
    } finally {
      Date.now = realNow;
    }
    await handleWardrobeDiscardPurge({ userId: USER, wardrobeItemId: fresh.id }, { repos });

    const all = await repos.listWardrobeItems(USER);
    expect(all.map((i) => i.id).sort()).toEqual([restored.id].sort());
    // `fresh` is still discarded (hidden) and restorable; `old` is gone for good.
    expect(await repos.restoreWardrobeItem(fresh.id, USER, new Date(0))).not.toBeNull();
    expect(await repos.restoreWardrobeItem(old.id, USER, new Date(0))).toBeNull();
  });
});

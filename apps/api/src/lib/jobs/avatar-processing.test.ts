import { describe, expect, it } from "vitest";
import {
  createAvatarProcessingHandler,
  newJobId,
} from "./avatar-processing.js";
import { createMemoryJobQueue } from "./queue.js";
import { createMemoryRepositories } from "../repositories/memory.js";
import { createFashnRenderProvider, createMockRenderProvider } from "../render/provider.js";
import { createMockStorage } from "../storage/r2.js";

describe("avatar processing", () => {
  it("processes jobs via drain", async () => {
    const repos = createMemoryRepositories();
    const storage = createMockStorage();
    const handler = createAvatarProcessingHandler({
      repos,
      storage,
      renderProvider: createMockRenderProvider(),
    });
    const queue = createMemoryJobQueue(
      {
        avatar: handler,
        tryon: async () => undefined,
        orderTransition: async () => undefined,
      },
      { autoProcess: false, repos },
    );
    const { user } = await repos.createUser("919876543210");

    await storage.put({
      key: "uploads/u/1.jpg",
      body: Buffer.from("x"),
      contentType: "image/jpeg",
    });

    const avatarId = newJobId();
    await repos.upsertAvatar({
      id: avatarId,
      userId: user.id,
      referenceImageKey: null,
      sourceUploadKeys: ["uploads/u/1.jpg"],
      bodyMeta: {},
      status: "PROCESSING",
    });

    await queue.enqueueAvatarProcessing({
      jobId: newJobId(),
      userId: user.id,
      avatarId,
      uploadKeys: ["uploads/u/1.jpg"],
    });
    await queue.drain();

    const avatar = await repos.findAvatarByUserId(user.id);
    expect(avatar?.status).toBe("READY");
    expect(await repos.findUserById(user.id)).toMatchObject({ avatarStatus: "READY" });
  });

  it("marks failed when provider throws", async () => {
    const repos = createMemoryRepositories();
    const storage = createMockStorage();
    const handler = createAvatarProcessingHandler({
      repos,
      storage,
      renderProvider: {
        name: "fail",
        async createAvatarReference() {
          throw new Error("fail");
        },
        async tryOn() {
          throw new Error("fail");
        },
      },
    });
    const { user } = await repos.createUser("919876543210");
    const avatarId = newJobId();
    await repos.upsertAvatar({
      id: avatarId,
      userId: user.id,
      referenceImageKey: null,
      sourceUploadKeys: ["uploads/u/1.jpg"],
      bodyMeta: {},
      status: "PROCESSING",
    });

    await handler({
      jobId: newJobId(),
      userId: user.id,
      avatarId,
      uploadKeys: ["uploads/u/1.jpg"],
    });

    const avatar = await repos.findAvatarByUserId(user.id);
    expect(avatar?.status).toBe("FAILED");
  });

  it("with the live provider, keeps the uploaded photo as the reference and deletes only the rest", async () => {
    const repos = createMemoryRepositories();
    const stored = new Map<string, string>();
    const storage = {
      ...createMockStorage(),
      async put(o: { key: string; body: Buffer }) {
        stored.set(o.key, o.body.toString());
        return { key: o.key };
      },
      async delete(key: string) {
        stored.delete(key);
      },
      async deleteMany(keys: string[]) {
        for (const key of keys) stored.delete(key);
      },
    };
    const { user } = await repos.createUser("919876543211");
    await storage.put({ key: "uploads/u/selfie.jpg", body: Buffer.from("REAL PHOTO") });
    await storage.put({ key: "uploads/u/extra.jpg", body: Buffer.from("SECOND PHOTO") });
    const avatarId = newJobId();

    await createAvatarProcessingHandler({
      repos,
      storage,
      renderProvider: createFashnRenderProvider("live-key", { resolveImage: async (k) => k }),
    })({ jobId: newJobId(), userId: user.id, avatarId, uploadKeys: ["uploads/u/selfie.jpg", "uploads/u/extra.jpg"] });

    const avatar = await repos.findAvatarByUserId(user.id);
    expect(avatar).toMatchObject({ status: "READY", referenceImageKey: "uploads/u/selfie.jpg" });
    expect([...stored]).toEqual([["uploads/u/selfie.jpg", "REAL PHOTO"]]);
  });
});

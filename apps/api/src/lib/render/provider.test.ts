import { describe, expect, it, vi } from "vitest";
import {
  createMockRenderProvider,
  createFashnRenderProvider,
  createRenderProvider,
} from "./provider.js";

describe("createMockRenderProvider", () => {
  it("normalizes upload keys to reference keys", async () => {
    const provider = createMockRenderProvider();
    expect(provider.name).toBe("mock-fashn");
    const result = await provider.createAvatarReference({
      uploadKeys: ["uploads/user/a.jpg"],
    });
    expect(result.referenceImageKey).toBe("references/user/a.jpg");
    expect(result.bodyMeta.normalized).toBe(true);
  });

  it("returns try-on image key and cost", async () => {
    const provider = createMockRenderProvider();
    const result = await provider.tryOn({
      modelImageKey: "references/u.jpg",
      garmentImageKey: "garments/g.jpg",
    });
    expect(result.costMicros).toBe(50_000);
    expect(result.imageKey).toContain("references/u.jpg");
  });
});

describe("createFashnRenderProvider", () => {
  it("falls back to mock without api key", async () => {
    const provider = createFashnRenderProvider();
    expect(provider.name).toBe("mock-fashn");
  });

  it("uses fashn name when api key provided", async () => {
    const provider = createFashnRenderProvider("test-key", {
      resolveImage: async (key) => `https://mock.test/${key}`,
    });
    expect(provider.name).toBe("fashn");
    const ref = await provider.createAvatarReference({ uploadKeys: ["uploads/x.jpg"] });
    expect(ref.referenceImageKey).toBe("references/x.jpg");
  });

  it("calls FASHN tryon-max with resolved image URLs", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const href = typeof url === "string" ? url : url.toString();
      if (href.endsWith("/run")) {
        return new Response(JSON.stringify({ id: "pred-live" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          id: "pred-live",
          status: "completed",
          output: ["https://cdn.fashn.ai/pred-live/output_0.jpg"],
        }),
        {
          status: 200,
          headers: { "x-fashn-credits-used": "3" },
        },
      );
    });

    const resolveImage = vi.fn(async (key: string) => `https://r2.test/${key}`);
    const provider = createFashnRenderProvider("live-key", { resolveImage, fetchImpl });

    const result = await provider.tryOn({
      modelImageKey: "references/model.jpg",
      garmentImageKey: "garments/shirt.jpg",
    });

    expect(resolveImage).toHaveBeenCalledWith("references/model.jpg");
    expect(resolveImage).toHaveBeenCalledWith("garments/shirt.jpg");
    expect(fetchImpl).toHaveBeenCalled();
    expect(result.imageKey).toBe("tryon/fashn/pred-live.jpg");
    expect(result.costMicros).toBe(75_000);
  });

  it("requires resolveImage when api key is set", async () => {
    const provider = createFashnRenderProvider("live-key");
    await expect(
      provider.tryOn({
        modelImageKey: "references/model.jpg",
        garmentImageKey: "garments/shirt.jpg",
      }),
    ).rejects.toThrow("resolveImage");
  });
});

describe("createRenderProvider", () => {
  it("uses mock when no api key in env or deps", () => {
    const prev = process.env.FASHN_API_KEY;
    delete process.env.FASHN_API_KEY;
    try {
      expect(createRenderProvider().name).toBe("mock-fashn");
    } finally {
      if (prev !== undefined) process.env.FASHN_API_KEY = prev;
    }
  });

  it("prefers explicit api key over env", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const href = typeof url === "string" ? url : url.toString();
      if (href.endsWith("/run")) {
        return new Response(JSON.stringify({ id: "pred-env" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          id: "pred-env",
          status: "completed",
          output: ["https://cdn.fashn.ai/pred-env/output_0.jpg"],
        }),
        {
          status: 200,
          headers: { "x-fashn-credits-used": "2" },
        },
      );
    });

    const provider = createRenderProvider({
      apiKey: "explicit-key",
      resolveImage: async (key) => `https://r2.test/${key}`,
      fetchImpl,
    });
    expect(provider.name).toBe("fashn");

    const result = await provider.tryOn({
      modelImageKey: "references/a.jpg",
      garmentImageKey: "garments/b.jpg",
    });
    expect(result.imageKey).toBe("tryon/fashn/pred-env.jpg");
  });
});

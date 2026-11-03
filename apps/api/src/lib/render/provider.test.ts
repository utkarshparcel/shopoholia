import { describe, expect, it, vi } from "vitest";
import {
  createMockRenderProvider,
  createFashnRenderProvider,
  createRenderProvider,
  createUnavailableRenderProvider,
  RenderUnavailableError,
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
    // The live provider keeps the uploaded photo as the reference; it never writes mock bytes.
    const ref = await provider.createAvatarReference({ uploadKeys: ["uploads/x.jpg"] });
    expect(ref.referenceImageKey).toBe("uploads/x.jpg");
    expect(ref.imageBytes).toBeUndefined();
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

/** FASHN's API as the client sees it: /run, then /status completed, then the output download. */
function fakeFashn(output = "https://cdn.fashn.ai/pred-1/output_0.jpg") {
  const runBodies: Array<{ inputs: { model_image: string; product_image: string } }> = [];
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const href = typeof url === "string" ? url : url.toString();
    if (href.endsWith("/run")) {
      runBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: "pred-1" }), { status: 200 });
    }
    if (href.includes("/status/")) {
      return new Response(JSON.stringify({ id: "pred-1", status: "completed", output: [output] }), { status: 200 });
    }
    if (href === output) return new Response(jpeg, { status: 200 });
    return new Response("not found", { status: 404 });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, runBodies, jpeg };
}

describe("live FASHN provider images", () => {
  it("sends catalog URLs as they are and signs only storage keys", async () => {
    const { fetchImpl, runBodies, jpeg } = fakeFashn();
    const resolveImage = vi.fn(async (key: string) => `https://media.worncloset.app/${key}`);
    const provider = createFashnRenderProvider("live-key", { resolveImage, fetchImpl });

    const result = await provider.tryOn({
      modelImageKey: "uploads/u1/selfie.jpg",
      garmentImageKey: "https://assets.newme.asia/x.webp",
    });

    expect(runBodies[0]!.inputs).toMatchObject({
      model_image: "https://media.worncloset.app/uploads/u1/selfie.jpg",
      product_image: "https://assets.newme.asia/x.webp",
    });
    expect(resolveImage).toHaveBeenCalledExactlyOnceWith("uploads/u1/selfie.jpg");
    expect(Buffer.from(result.imageBytes!)).toEqual(Buffer.from(jpeg));
  });

  it("uses the try-on image itself for a scene, never placeholder bytes", async () => {
    const { fetchImpl } = fakeFashn();
    const provider = createFashnRenderProvider("live-key", { resolveImage: async (k) => k, fetchImpl });
    const scene = await provider.scenarioPass({ tryOnImageKey: "tryon/fashn/pred-1.jpg", scenario: "STUDIO" });
    expect(scene).toEqual({ imageKey: "tryon/fashn/pred-1.jpg", costMicros: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("without a key in production, avatars still keep the real photo and scenes are never mocks", async () => {
    const provider = createUnavailableRenderProvider();
    expect(await provider.createAvatarReference({ uploadKeys: ["uploads/u/a.jpg", "uploads/u/b.jpg"] })).toMatchObject({
      referenceImageKey: "uploads/u/a.jpg",
    });
    expect(await provider.scenarioPass({ tryOnImageKey: "tryon/x.jpg", scenario: "NIGHT" })).toEqual({
      imageKey: "tryon/x.jpg",
      costMicros: 0,
    });
    await expect(provider.tryOn({ modelImageKey: "a", garmentImageKey: "b" })).rejects.toBeInstanceOf(
      RenderUnavailableError,
    );
  });
});

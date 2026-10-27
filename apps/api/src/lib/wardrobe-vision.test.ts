import { describe, expect, it, vi } from "vitest";
import {
  HostedVisionTagClient,
  MockVisionTagClient,
  createVisionTagClientFromEnv,
  needsAutoTag,
  resolvePlaceholderIds,
  tagBatch,
  tagImageWithDupes,
  VISION_TAG_CONCURRENCY,
  withDuplicateCheck,
} from "./wardrobe-vision.js";

describe("WV04-AUTOTAG wardrobe-vision", () => {
  it("mock client tags from image key fixtures", async () => {
    const client = new MockVisionTagClient();
    const tag = await client.tag({ imageKey: "wardrobe/uniqlo-white-tshirt.jpg" });
    expect(tag.category).toBe("tshirt");
    expect(tag.colors).toContain("white");
    expect(tag.brand).toBe("Uniqlo");
  });

  it("needsAutoTag for placeholders / empty metadata", () => {
    expect(needsAutoTag({ category: "other" })).toBe(true);
    expect(needsAutoTag({ category: "shirt", colors: ["navy"], brand: "Zara" })).toBe(false);
    expect(needsAutoTag({ category: "shirt" })).toBe(true);
  });

  it("tagImageWithDupes warns near-duplicates", async () => {
    const result = await tagImageWithDupes(
      new MockVisionTagClient(),
      { imageKey: "wardrobe/zara-navy-shirt.jpg" },
      [{ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", title: "Zara navy shirt", brand: "Zara", category: "shirt" }],
    );
    expect(result.category).toBe("shirt");
    expect(result.duplicateWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("hosted client merges API labels then falls back", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ labels: ["olive", "jacket"], brand: "Mango", confidence: 0.88 }),
    })) as unknown as typeof fetch;
    const client = new HostedVisionTagClient({
      url: "https://vision.example/tag",
      fetchImpl,
    });
    const tag = await client.tag({ imageKey: "uploads/x.jpg" });
    expect(tag.category).toBe("jacket");
    expect(tag.colors).toContain("olive");
    expect(tag.brand).toBe("Mango");
    expect(tag.confidence).toBe(0.88);
  });

  it("createVisionTagClientFromEnv defaults to mock", () => {
    expect(createVisionTagClientFromEnv({})).toBeInstanceOf(MockVisionTagClient);
  });

  it("tagBatch keeps order and nulls, caps calls in flight and shares one deadline", async () => {
    let inFlight = 0;
    let peak = 0;
    const signals = new Set<AbortSignal | undefined>();
    const client = {
      async tag(input: { imageKey: string; signal?: AbortSignal }) {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        signals.add(input.signal);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return new MockVisionTagClient().tag(input);
      },
    };
    const inputs = Array.from({ length: 12 }, (_, i) =>
      i % 3 === 0 ? null : { imageKey: `wardrobe/zara-navy-shirt-${i}.jpg` },
    );
    const out = await tagBatch(client, inputs);
    expect(out).toHaveLength(12);
    expect(out.map((t) => t === null)).toEqual(inputs.map((i) => i === null));
    expect(out[1]!.category).toBe("shirt");
    expect(peak).toBeLessThanOrEqual(VISION_TAG_CONCURRENCY);
    expect(signals.size).toBe(1);
    expect([...signals][0]).toBeInstanceOf(AbortSignal);
  });

  it("hosted client falls back to the label heuristics when the batch deadline aborts it", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return { ok: true, json: async () => ({ category: "jacket" }) };
    }) as unknown as typeof fetch;
    const client = new HostedVisionTagClient({ url: "https://vision.example/tag", fetchImpl });
    const controller = new AbortController();
    controller.abort();
    const tag = await client.tag({ imageKey: "uploads/x.jpg", labels: ["blue", "jeans"], signal: controller.signal });
    expect(tag.category).toBe("jeans");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("withDuplicateCheck keeps the client's tag and checks it against owned items", () => {
    const vision = {
      category: "shirt",
      colors: ["navy"],
      brand: "Zara",
      confidence: 0.9,
      sourceLabels: ["navy", "shirt"],
    };
    const result = withDuplicateCheck(vision as never, { imageKey: "u/x/wardrobe/1.jpg" }, [
      { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", title: "Zara navy shirt", brand: "Zara", category: "shirt" },
    ]);
    expect(result).toMatchObject({ category: "shirt", colors: ["navy"], brand: "Zara", confidence: 0.9 });
    expect(result.duplicateWarnings.length).toBeGreaterThanOrEqual(1);
    const ids = new Map([["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "real-id"]]);
    expect(resolvePlaceholderIds(result.duplicateWarnings, ids)[0]!.matches[0]!.wardrobeItemId).toBe("real-id");
  });
});

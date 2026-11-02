import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { REVEAL_COMBINE_MAX_ITEMS } from "../economy.js";
import { GenerateRenderBodySchema } from "./reveal.js";

const ids = (n: number) => Array.from({ length: n }, () => randomUUID());

describe("GenerateRenderBodySchema", () => {
  it("takes one to REVEAL_COMBINE_MAX_ITEMS order items", () => {
    expect(GenerateRenderBodySchema.safeParse({ orderItemIds: [], scenario: "STUDIO" }).success).toBe(false);
    expect(GenerateRenderBodySchema.safeParse({ orderItemIds: ids(1), scenario: "STUDIO" }).success).toBe(true);
    expect(
      GenerateRenderBodySchema.safeParse({ orderItemIds: ids(REVEAL_COMBINE_MAX_ITEMS), scenario: "STUDIO" })
        .success,
    ).toBe(true);
    expect(
      GenerateRenderBodySchema.safeParse({ orderItemIds: ids(REVEAL_COMBINE_MAX_ITEMS + 1), scenario: "STUDIO" })
        .success,
    ).toBe(false);
  });
});

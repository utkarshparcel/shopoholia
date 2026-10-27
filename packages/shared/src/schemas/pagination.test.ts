import { describe, expect, it } from "vitest";
import { z } from "zod";
import { PageQuerySchema, pageResponse } from "./pagination.js";

describe("PageQuerySchema", () => {
  it("coerces limit from a query string and defaults to 50", () => {
    expect(PageQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(PageQuerySchema.parse({ limit: "7", cursor: "abc" })).toEqual({ limit: 7, cursor: "abc" });
    expect(PageQuerySchema.parse({ limit: "200" }).limit).toBe(200);
  });

  it("rejects out-of-range or fractional limits and long cursors", () => {
    for (const limit of ["0", "201", "1.5", "-3", "ten"]) {
      expect(PageQuerySchema.safeParse({ limit }).success).toBe(false);
    }
    expect(PageQuerySchema.safeParse({ cursor: "x".repeat(513) }).success).toBe(false);
    expect(PageQuerySchema.safeParse({ cursor: "x".repeat(512) }).success).toBe(true);
  });
});

describe("pageResponse", () => {
  it("wraps items and requires nextCursor, null on the last page", () => {
    const schema = pageResponse(z.object({ id: z.string() }));
    expect(schema.parse({ items: [{ id: "a" }], nextCursor: null })).toEqual({
      items: [{ id: "a" }],
      nextCursor: null,
    });
    expect(schema.safeParse({ items: [] }).success).toBe(false);
    expect(schema.safeParse({ items: [{ id: 1 }], nextCursor: "c" }).success).toBe(false);
  });
});

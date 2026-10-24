import { describe, expect, it } from "vitest";
import {
  compareText,
  decodeListingCursor,
  encodeListingCursor,
  matchesStyleKeywords,
  normalizeStyleKeywords,
} from "./listing-feed.js";

const ID = "0b9f5c2e-7d1a-4c3b-9e8f-1a2b3c4d5e6f";

describe("listing cursors", () => {
  it("round-trips catalog-order and style-ranked cursors", () => {
    expect(encodeListingCursor({ sortOrder: 12, id: ID }, null)).toBe(`12:${ID}`);
    expect(encodeListingCursor({ sortOrder: 12, id: ID }, true)).toBe(`1:12:${ID}`);
    expect(encodeListingCursor({ sortOrder: -3, id: ID }, false)).toBe(`0:-3:${ID}`);

    expect(decodeListingCursor(`12:${ID}`)).toEqual({ matched: null, sortOrder: 12, id: ID });
    expect(decodeListingCursor(`1:12:${ID}`)).toEqual({ matched: true, sortOrder: 12, id: ID });
    expect(decodeListingCursor(`0:-3:${ID}`)).toEqual({ matched: false, sortOrder: -3, id: ID });
    expect(decodeListingCursor(`5:${ID.toUpperCase()}`)).toEqual({
      matched: null,
      sortOrder: 5,
      id: ID,
    });
  });

  it.each([
    ["a bare id", ID],
    ["an empty string", ""],
    ["a non-uuid id", "12:not-a-uuid"],
    ["a non-integer sort order", `1.5:${ID}`],
    ["an empty sort order", `:${ID}`],
    ["a sort order past int32", `2147483648:${ID}`],
    ["an unknown match flag", `2:12:${ID}`],
    ["too many parts", `1:1:12:${ID}`],
  ])("rejects %s", (_label, cursor) => {
    expect(decodeListingCursor(cursor)).toBeNull();
  });
});

describe("style keyword matching", () => {
  const listing = (title: string, category = "tops", tags: string[] = []) => ({
    title,
    category,
    tags,
  });

  it("normalizes keywords to lowercase ASCII words and drops empties and repeats", () => {
    expect(normalizeStyleKeywords(["Off-White", " off  white ", "T-Shirt", "---", "", "Crêpe"])).toEqual(
      ["off white", "t shirt", "cr pe"],
    );
  });

  it("matches whole words and phrases in the title, category or tags, ignoring case", () => {
    const keywords = normalizeStyleKeywords(["t shirt", "off white", "night out", "tee", "dresses"]);
    expect(matchesStyleKeywords(listing("Dark Grey Graphic Printed T-Shirt"), keywords)).toBe(true);
    expect(matchesStyleKeywords(listing("OFF-WHITE STRIPED MAXI"), keywords)).toBe(true);
    expect(matchesStyleKeywords(listing("Satin slip", "Bottoms", ["night-out"]), keywords)).toBe(true);
    expect(matchesStyleKeywords(listing("Wine Tiered Lace Mini", "Dresses"), keywords)).toBe(true);

    // Parts of words don't count.
    expect(matchesStyleKeywords(listing("Teen Crop Top", "tops", ["src:newme"]), keywords)).toBe(false);
    expect(matchesStyleKeywords(listing("White Shirt"), keywords)).toBe(false);
    expect(matchesStyleKeywords(listing("Anything"), [])).toBe(false);
  });

  it("orders text by code unit, like Postgres uuids and the C collation", () => {
    expect(["b", "B", "a", "a"].sort(compareText)).toEqual(["B", "a", "a", "b"]);
  });
});

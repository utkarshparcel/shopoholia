import { readFileSync } from "node:fs";
import { STYLE_QUIZ_QUESTIONS } from "@worn/shared";
import { describe, expect, it } from "vitest";
import { matchesStyleKeywords, normalizeStyleKeywords } from "../repositories/listing-feed.js";
import { BUNDLED_SCRAPED_CATALOG_PATH, parseCatalogJsonl } from "../seed/scraped.js";
import { STYLE_TAG_KEYWORDS, styleKeywordsForTags } from "./style-match.js";

const quizOption = (questionId: string, optionId: string) =>
  STYLE_QUIZ_QUESTIONS.find((q) => q.id === questionId)!.options.find((o) => o.id === optionId)!;

// What the boot seed loads: real scraped rows, whose only tag is "src:<site>".
const catalog = parseCatalogJsonl(readFileSync(BUNDLED_SCRAPED_CATALOG_PATH, "utf8")).map(
  (row) => ({ title: row.title, category: row.category, tags: [`src:${row.source}`, ...row.tags] }),
);

function matchingTitles(tags: string[]) {
  const keywords = normalizeStyleKeywords(styleKeywordsForTags(tags));
  return catalog.filter((row) => matchesStyleKeywords(row, keywords)).map((row) => row.title);
}

describe("styleKeywordsForTags", () => {
  it("covers every tag the style quiz can produce", () => {
    const quizTags = STYLE_QUIZ_QUESTIONS.flatMap((q) => q.options.flatMap((o) => o.tags ?? []));
    for (const tag of quizTags) {
      expect(STYLE_TAG_KEYWORDS, `no keywords decided for quiz tag "${tag}"`).toHaveProperty(tag);
    }
  });

  it("expands tags, ignores budget bands and passes unknown tags through", () => {
    expect(styleKeywordsForTags(["tees"])).toEqual(["tees", "tee", "t shirt", "t shirts", "tshirt", "tshirts"]);
    expect(styleKeywordsForTags(["budget", "mid", "premium", "luxury"])).toEqual([]);
    expect(styleKeywordsForTags(["boho", "constructor"])).toEqual(["boho", "constructor"]);
    expect(styleKeywordsForTags(["casual", "daily"]).filter((k) => k === "everyday")).toHaveLength(1);
  });
});

describe("style matching on the scraped catalog", () => {
  it("has catalog rows to check against", () => {
    expect(catalog.length).toBeGreaterThanOrEqual(30);
  });

  it("splits the catalog for every palette, since titles lead with a colour", () => {
    for (const option of STYLE_QUIZ_QUESTIONS.find((q) => q.id === "palette")!.options) {
      const matches = matchingTitles(option.tags ?? []);
      expect(matches.length, option.id).toBeGreaterThan(0);
      expect(matches.length, option.id).toBeLessThan(catalog.length);
    }
  });

  it("matches the pieces a shopper would expect", () => {
    const neutrals = matchingTitles(quizOption("palette", "neutrals").tags!);
    expect(neutrals).toContain("Black Solid One Shoulder Top");
    expect(neutrals).toContain("Off White Striped Maxi Dress");
    expect(neutrals).toContain("Beige Leopard Print Maxi Dress");
    expect(neutrals).not.toContain("Red Draped Detail Mini Dress");

    expect(matchingTitles(quizOption("palette", "vivid").tags!)).toContain("Red Draped Detail Mini Dress");
    expect(matchingTitles(quizOption("palette", "earth").tags!)).toContain("Sage Ruched Bodycon Mini Dress");
    expect(matchingTitles(quizOption("palette", "pastel").tags!)).toContain("Light Pink Embroidered Top");

    const casual = matchingTitles(quizOption("vibe", "casual").tags!);
    expect(casual).toContain("Dark Grey Graphic Printed T-Shirt");
    expect(casual).toContain("Spiderman Inspired Oversized Zipper Hoodie");
    expect(casual).not.toContain("Wine Sequin Mini Corset Dress");

    const party = matchingTitles(quizOption("occasion", "party").tags!);
    expect(party).toContain("Wine Sequin Mini Corset Dress");
    expect(party).not.toContain("Blue High-Rise Bootcut Pants");

    expect(matchingTitles(quizOption("vibe", "classic").tags!)).toEqual([
      "Orange Ethnic Printed Keyhole Neck Top",
    ]);
    expect(matchingTitles(quizOption("fit", "cropped").tags!)).toEqual([
      "Pink Floral Sweetheart Tie-Up Crop Top",
    ]);
  });

  it("ranks a whole quiz profile ahead of the rest without swallowing the catalog", () => {
    const tags = ["vibe:casual", "palette:neutrals", "budget:u1000", "occasion:casual", "fit:oversized"]
      .map((answer) => answer.split(":") as [string, string])
      .flatMap(([question, option]) => quizOption(question, option).tags!);
    const matches = matchingTitles(tags);
    expect(matches.length).toBeGreaterThan(catalog.length / 4);
    expect(matches.length).toBeLessThan(catalog.length);
    expect(matches).not.toContain("Red Draped Detail Mini Dress");
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import {
  buildParserBreakBanner,
  clearParserBreakFlags,
  dismissParserBreakBanner,
  setParserBreakFlag,
} from "./parser-break-banner.js";

describe("U050 parser-break-banner", () => {
  beforeEach(() => clearParserBreakFlags());

  it("shows scanning delayed banner with manual add and no fake credits", () => {
    expect(buildParserBreakBanner("u1").visible).toBe(false);
    setParserBreakFlag({ merchant: "Myntra", broken: true, reason: "parser 5xx" });
    const banner = buildParserBreakBanner("u1");
    expect(banner.visible).toBe(true);
    expect(banner.title).toMatch(/scanning delayed/i);
    expect(banner.manualAddLabel).toBe("Add manually");
    expect(banner.inventCredits).toBe(false);
    expect(banner.merchants).toContain("Myntra");

    dismissParserBreakBanner("u1", "Myntra");
    expect(buildParserBreakBanner("u1").visible).toBe(false);
  });
});

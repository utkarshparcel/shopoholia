import { describe, expect, it } from "vitest";
import { merchantDeepLink, normalizeMerchantKey } from "./merchantDeepLink.js";

describe("normalizeMerchantKey", () => {
  it("lowercases and strips noise", () => {
    expect(normalizeMerchantKey("AMAZON")).toBe("amazon");
    expect(normalizeMerchantKey("  Myntra ")).toBe("myntra");
    expect(normalizeMerchantKey("Flipkart India")).toBe("flipkartindia");
  });
});

describe("merchantDeepLink", () => {
  it("maps Amazon / Flipkart / Myntra to affiliate homes", () => {
    expect(merchantDeepLink("Amazon")).toContain("amazon.in");
    expect(merchantDeepLink("Amazon")).toContain("tag=shopoholia-21");
    expect(merchantDeepLink("AMAZON")).toContain("amazon.in");
    expect(merchantDeepLink("Flipkart")).toContain("flipkart.com");
    expect(merchantDeepLink("Flipkart")).toContain("affid=");
    expect(merchantDeepLink("Myntra")).toContain("myntra.com");
    expect(merchantDeepLink("Ajio")).toContain("ajio.com");
    expect(merchantDeepLink("Nykaa")).toContain("nykaa");
  });

  it("returns null for unknown merchants", () => {
    expect(merchantDeepLink("")).toBeNull();
    expect(merchantDeepLink("Local Boutique")).toBeNull();
  });

  it("matches prefixed merchant labels from parsers", () => {
    expect(merchantDeepLink("amazon.in")).toContain("amazon.in");
    expect(merchantDeepLink("AMAZON.COM")).toContain("amazon.com");
  });
});

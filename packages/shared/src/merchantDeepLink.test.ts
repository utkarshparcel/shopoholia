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
    expect(merchantDeepLink("AMAZON")).toContain("amazon.in");
    expect(merchantDeepLink("Flipkart")).toContain("flipkart.com");
    expect(merchantDeepLink("Myntra")).toContain("myntra.com");
    expect(merchantDeepLink("Ajio")).toContain("ajio.com");
    expect(merchantDeepLink("Nykaa")).toContain("nykaa");
  });

  it("tags links only with configured affiliate ids, never a placeholder", () => {
    expect(merchantDeepLink("Amazon")).toBe("https://www.amazon.in/");
    expect(merchantDeepLink("Flipkart")).toBe("https://www.flipkart.com/");
    expect(merchantDeepLink("Myntra")).toBe("https://www.myntra.com/");
    const ids = { amazon: "worn-21", flipkart: "wornfk" };
    expect(merchantDeepLink("Amazon", ids)).toBe("https://www.amazon.in/?tag=worn-21");
    expect(merchantDeepLink("amazon.com", ids)).toBe("https://www.amazon.com/?tag=worn-21");
    expect(merchantDeepLink("Flipkart", ids)).toBe("https://www.flipkart.com/?affid=wornfk");
    expect(merchantDeepLink("Ajio", ids)).toBe("https://www.ajio.com/");
    expect(merchantDeepLink("Swiggy", ids)).toBe("https://www.swiggy.com/");
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

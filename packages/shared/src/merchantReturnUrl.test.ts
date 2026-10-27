import { describe, expect, it } from "vitest";
import { merchantReturnUrl } from "./merchantReturnUrl.js";

describe("merchantReturnUrl (WV01-PICKUP-BOOK)", () => {
  it("maps known merchants to return portals", () => {
    expect(merchantReturnUrl("Amazon")).toContain("amazon.in");
    expect(merchantReturnUrl("Amazon")).toContain("returns");
    expect(merchantReturnUrl("AMAZON")).toContain("amazon.in");
    expect(merchantReturnUrl("Flipkart")).toContain("flipkart.com");
    expect(merchantReturnUrl("Myntra")).toContain("myntra.com");
    expect(merchantReturnUrl("Ajio")).toContain("ajio.com");
    expect(merchantReturnUrl("Nykaa")).toContain("nykaa");
  });

  it("returns null for unknown merchants", () => {
    expect(merchantReturnUrl("")).toBeNull();
    expect(merchantReturnUrl("Local Boutique")).toBeNull();
  });

  it("matches prefixed parser labels", () => {
    expect(merchantReturnUrl("amazon.in")).toContain("amazon.in");
    expect(merchantReturnUrl("AMAZON.COM")).toContain("amazon.com");
  });
});

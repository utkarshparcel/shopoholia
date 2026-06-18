import { describe, expect, it } from "vitest";

import {
  ANALYTICS_EVENTS,
  AnalyticsEventNameSchema,
  RevealRatingBodySchema,
  RevealRatingResponseSchema,
} from "./analytics.js";

describe("analytics schemas", () => {
  it("defines the Phase I funnel events", () => {
    expect(ANALYTICS_EVENTS).toEqual([
      "install",
      "avatar_complete",
      "add_to_cart",
      "checkout",
      "wait_complete",
      "reveal_opened",
      "reveal_rated",
      "unlock",
      "share",
    ]);
  });

  it("validates event names", () => {
    expect(AnalyticsEventNameSchema.parse("checkout")).toBe("checkout");
    expect(() => AnalyticsEventNameSchema.parse("unknown")).toThrow();
  });

  it("validates reveal rating payloads", () => {
    expect(RevealRatingBodySchema.parse({ rating: "loved" })).toEqual({
      rating: "loved",
    });
    expect(() => RevealRatingBodySchema.parse({ rating: "bad" })).toThrow();
  });

  it("validates reveal rating responses", () => {
    const response = RevealRatingResponseSchema.parse({
      orderId: "11111111-1111-4111-8111-111111111111",
      rating: "ok",
      recorded: true,
    });
    expect(response.rating).toBe("ok");
  });
});

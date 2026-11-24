import { describe, expect, it } from "vitest";
import {
  ONBOARDING_COIN_GRANT,
  TIER_TIMINGS_BETA,
  TIER_TIMINGS_PROD,
  FREE_REVEAL_RENDERS_PER_ITEM,
  REVEAL_UNLOCK_COST_COINS,
  RUSH_TO_EXPRESS_COST_COINS,
  coinPriceForRupees,
} from "./economy.js";

describe("coinPriceForRupees", () => {
  it("charges about a coin per ₹10, to the nearest 5, at least 10", () => {
    expect(coinPriceForRupees(549)).toBe(55);
    expect(coinPriceForRupees(405)).toBe(40);
    expect(coinPriceForRupees(1649)).toBe(165);
    expect(coinPriceForRupees(49)).toBe(10);
  });

  it("lets the welcome grant buy a first haul of several pieces", () => {
    // The bundled catalog's shop prices run ₹405 to ₹1,649.
    const typical = coinPriceForRupees(950);
    expect(Math.floor(ONBOARDING_COIN_GRANT / typical)).toBeGreaterThanOrEqual(4);
    expect(Math.floor(ONBOARDING_COIN_GRANT / typical)).toBeLessThanOrEqual(6);
  });
});
import { DeliveryTier, OrderState, StateEtaSchema } from "./schemas/order.js";
import {
  OtpRequestSchema,
  VerifyRequestSchema,
  TokenResponseSchema,
  RefreshRequestSchema,
  GoogleAuthRequestSchema,
} from "./schemas/auth.js";
import {
  AvatarStatusSchema,
  AvatarResponseSchema,
  AvatarUploadResponseSchema,
} from "./schemas/avatar.js";

describe("economy constants", () => {
  it("exports tunable economy values", () => {
    expect(ONBOARDING_COIN_GRANT).toBe(500);
    expect(FREE_REVEAL_RENDERS_PER_ITEM).toBe(1);
    expect(REVEAL_UNLOCK_COST_COINS).toBe(50);
    expect(RUSH_TO_EXPRESS_COST_COINS).toBe(25);
  });

  it("defines prod and beta tier timings for all tiers", () => {
    for (const tier of DeliveryTier.options) {
      expect(TIER_TIMINGS_PROD[tier].DELIVERED).toBeGreaterThan(0);
      expect(TIER_TIMINGS_BETA[tier].DELIVERED).toBeGreaterThan(0);
    }
    // Standard keeps the ~5 min beta arc.
    expect(TIER_TIMINGS_BETA.STANDARD.DELIVERED).toBe(300_000);
  });

  it.each([
    ["prod", TIER_TIMINGS_PROD],
    ["beta", TIER_TIMINGS_BETA],
  ] as const)("%s timings run each tier's steps in order, every step sooner on a faster tier", (_, timings) => {
    const steps = ["PROCESSING", "PACKED", "OUT_FOR_DELIVERY", "ARRIVING_SOON", "DELIVERED"] as const;
    for (const tier of DeliveryTier.options) {
      for (let i = 1; i < steps.length; i++) {
        expect(timings[tier][steps[i]!]).toBeGreaterThan(timings[tier][steps[i - 1]!]);
      }
    }
    for (const step of steps) {
      expect(timings.EXPRESS[step]).toBeLessThan(timings.STANDARD[step]);
      expect(timings.STANDARD[step]).toBeLessThan(timings.SLOW_BURN[step]);
    }
  });
});

describe("order schemas", () => {
  it("parses order state and delivery tier", () => {
    expect(OrderState.parse("REVEAL_READY")).toBe("REVEAL_READY");
    expect(DeliveryTier.parse("EXPRESS")).toBe("EXPRESS");
  });

  it("parses state eta map", () => {
    const eta = StateEtaSchema.parse({
      PROCESSING: "2026-01-01T00:00:00.000Z",
    });
    expect(eta.PROCESSING).toBeDefined();
  });
});

describe("auth schemas", () => {
  it("validates otp request", () => {
    expect(OtpRequestSchema.parse({ phone: "919876543210" }).phone).toBe("919876543210");
  });

  it("validates verify request", () => {
    const body = VerifyRequestSchema.parse({ phone: "919876543210", otp: "123456" });
    expect(body.otp).toHaveLength(6);
  });

  it("validates token response", () => {
    const res = TokenResponseSchema.parse({
      accessToken: "a",
      refreshToken: "b",
      isNewUser: true,
      coinBalance: 500,
    });
    expect(res.coinBalance).toBe(500);
  });

  it("validates refresh request", () => {
    expect(RefreshRequestSchema.parse({ refreshToken: "token" }).refreshToken).toBe("token");
  });

  it("validates google auth request", () => {
    expect(
      GoogleAuthRequestSchema.parse({ idToken: "a".repeat(40) }).idToken,
    ).toHaveLength(40);
  });
});

describe("avatar schemas", () => {
  it("validates avatar status enum", () => {
    expect(AvatarStatusSchema.parse("READY")).toBe("READY");
  });

  it("validates avatar response", () => {
    const res = AvatarResponseSchema.parse({
      status: "NONE",
      referencePreviewUrl: null,
    });
    expect(res.status).toBe("NONE");
  });

  it("validates upload response", () => {
    const res = AvatarUploadResponseSchema.parse({
      status: "PROCESSING",
      jobId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(res.status).toBe("PROCESSING");
  });
});

/**
 * W089–W094 growth / share / regional acceptance smoke.
 */
import { describe, expect, it } from "vitest";
import {
  buildFoundMoneyShareCard,
  blurFoundMoneyTotalLabel,
  FOUND_MONEY_SHARE_WATERMARK,
} from "./found-money.js";
import { buildNeverWornShareCard, WASTE_SHARE_WATERMARK } from "./waste.js";
import { COPY_PACKS, getCopyPack } from "./copy-packs.js";
import {
  defaultFitRegionFromCurrency,
  FIT_REGION_PACK_OPTIONS,
  normalizeFitRegionPack,
} from "./region-pack-picker.js";
import {
  buildWhatsAppStatusAsset,
  WA_STATUS_ASPECT,
  WA_STATUS_HEIGHT,
  WA_STATUS_WIDTH,
} from "./wa-status-asset.js";
import { buildReferralLandingCopy } from "./referral-landing.js";

describe("W089–W094 growth/share/regional", () => {
  it("W089 Reels blur preset digit-blurs total, omits merchants, watermarks worn.app", () => {
    const card = buildFoundMoneyShareCard({
      totalMinor: 12_34_00,
      accountCount: 2,
      merchants: ["Myntra", "Amazon"],
      currency: "INR",
      blurPreset: "reels",
    });
    expect(card.blurPreset).toBe("reels");
    expect(card.aspectRatio).toBe("9:16");
    expect(card.watermark).toBe(FOUND_MONEY_SHARE_WATERMARK);
    expect(card.displayAmountLabel).toBe(blurFoundMoneyTotalLabel(card.amountLabel));
    expect(card.displayAmountLabel).not.toMatch(/\d/);
    expect(card.blurredMerchants).toEqual([]);
    expect(card.shareText).not.toMatch(/Myntra|Amazon/);
    expect(card.shareText).toContain(FOUND_MONEY_SHARE_WATERMARK);
    expect(card.shareText).toContain(card.displayAmountLabel);
  });

  it("W090 never-worn share keeps blurred brands + watermark", () => {
    const card = buildNeverWornShareCard({
      neverWornCostMinor: 40_000_00,
      itemCount: 2,
      brands: ["Myntra", "Zara"],
      currency: "INR",
    });
    expect(card.blurredMerchants.every((m) => m.includes("•"))).toBe(true);
    expect(card.watermark).toBe(WASTE_SHARE_WATERMARK);
    expect(card.shareText).not.toMatch(/Myntra|Zara/);
    expect(card.shareText).toContain(WASTE_SHARE_WATERMARK);
  });

  it("W091 EN ↔ Hinglish copy packs switch vault/today strings", () => {
    const en = getCopyPack("en");
    const hi = getCopyPack("hinglish");
    expect(en.vault.emptyTitle).not.toBe(hi.vault.emptyTitle);
    expect(hi.vault.emptyMessage.toLowerCase()).toMatch(/gift card|vault/);
    expect(hi.today.emptyTitle).toMatch(/outfit|aaj/i);
    expect(COPY_PACKS.en.vault.shareCta).toMatch(/Share found money/i);
    expect(COPY_PACKS.hinglish.vault.shareCta).toMatch(/share/i);
  });

  it("W092 region pack picker seeds IN/US/UK/GLOBAL", () => {
    expect(FIT_REGION_PACK_OPTIONS.map((o) => o.region)).toEqual([
      "IN",
      "US",
      "UK",
      "GLOBAL",
    ]);
    expect(normalizeFitRegionPack("us")).toBe("US");
    expect(defaultFitRegionFromCurrency("GBP")).toBe("UK");
    expect(defaultFitRegionFromCurrency("USD")).toBe("US");
    expect(defaultFitRegionFromCurrency("INR")).toBe("IN");
  });

  it("W093 WA Status asset is 9:16 with no PII", () => {
    const asset = buildWhatsAppStatusAsset({
      totalMinor: 50_000,
      accountCount: 2,
      merchants: ["Myntra", "secret@email.com"],
      currency: "INR",
      deepLink: "https://worn.app/r/HOME01",
    });
    expect(asset.width).toBe(WA_STATUS_WIDTH);
    expect(asset.height).toBe(WA_STATUS_HEIGHT);
    expect(asset.aspectRatio).toBe(WA_STATUS_ASPECT);
    expect(asset.height / asset.width).toBeCloseTo(16 / 9, 5);
    expect(asset.watermark).toBe("worn.app");
    expect(asset.shareText).not.toMatch(/Myntra|secret@|email/i);
    expect(asset.shareText).not.toMatch(/\d{4}/);
    expect(asset.svg).toContain('width="1080"');
    expect(asset.svg).toContain('height="1920"');
    expect(asset.svg).not.toMatch(/Myntra|@/);
  });

  it("W094 referral landing explains found-money + install CTA", () => {
    const landing = buildReferralLandingCopy("HOME99");
    expect(landing.referralCode).toBe("HOME99");
    expect(landing.headline.toLowerCase()).toMatch(/gift card|forgotten/);
    expect(landing.body.toLowerCase()).toMatch(/store credit|gift/);
    expect(landing.body.toLowerCase()).not.toMatch(/\bplay\b|try-?on/);
    expect(landing.installCta).toMatch(/Install/i);
    expect(landing.installHint.toLowerCase()).toMatch(/email is optional|card/);
  });
});

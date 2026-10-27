import { describe, expect, it } from "vitest";
import {
  FAMILY_SHARE_ORIGIN,
  buildFamilyFoundMoneyShare,
  buildFamilyShareAttributionConfirm,
  buildReferralDeepLink,
  familyShareViaLabel,
  parseFamilyShareReferralCode,
} from "./family-share.js";
import { FOUND_MONEY_SHARE_WATERMARK } from "./found-money.js";

describe("buildReferralDeepLink (N36)", () => {
  it("builds worn.app/r/{code}", () => {
    expect(buildReferralDeepLink("abc123")).toBe(`${FAMILY_SHARE_ORIGIN}/r/ABC123`);
    expect(buildReferralDeepLink("  xy-z9  ")).toBe(`${FAMILY_SHARE_ORIGIN}/r/XYZ9`);
  });

  it("rejects short / empty codes", () => {
    expect(buildReferralDeepLink("")).toBeNull();
    expect(buildReferralDeepLink("ab")).toBeNull();
    expect(buildReferralDeepLink("!!!")).toBeNull();
  });

  it("respects custom origin without trailing slash", () => {
    expect(buildReferralDeepLink("HOME01", "https://staging.worn.app/")).toBe(
      "https://staging.worn.app/r/HOME01",
    );
  });
});

describe("buildFamilyFoundMoneyShare", () => {
  it("appends referral deep link to share text", () => {
    const card = buildFamilyFoundMoneyShare({
      totalMinor: 50_000,
      accountCount: 1,
      merchants: ["Myntra"],
      referralCode: "FAMILY1",
    });
    expect(card.deepLink).toBe(`${FAMILY_SHARE_ORIGIN}/r/FAMILY1`);
    expect(card.shareText).toContain(FOUND_MONEY_SHARE_WATERMARK);
    expect(card.shareText).toContain(card.deepLink);
    expect(card.shareText).not.toMatch(/Myntra/);
    expect(card.referralCode).toBe("FAMILY1");
  });

  it("falls back to PENDING deep link when referral code is short", () => {
    const card = buildFamilyFoundMoneyShare({
      totalMinor: 10_000,
      accountCount: 1,
      referralCode: "ab",
      origin: "https://staging.worn.app/",
    });
    expect(card.referralCode).toBe("PENDING");
    expect(card.deepLink).toBe("https://staging.worn.app/r/PENDING");
    expect(card.shareText).toContain(card.deepLink);
  });
});

describe("W024 family share attribution UI", () => {
  it("builds shared-via label and parses code from deep link", () => {
    const link = `${FAMILY_SHARE_ORIGIN}/r/HOME99`;
    expect(familyShareViaLabel(link)).toBe("shared via worn.app/r/HOME99");
    expect(parseFamilyShareReferralCode(link)).toBe("HOME99");
    expect(parseFamilyShareReferralCode("home99")).toBe("HOME99");
    expect(parseFamilyShareReferralCode("ab")).toBeNull();
  });

  it("builds attribution confirm copy without PII merchants", () => {
    const confirm = buildFamilyShareAttributionConfirm("FAMILY1");
    expect(confirm?.viaLabel).toContain("worn.app/r/FAMILY1");
    expect(confirm?.headline).toMatch(/credited/i);
    expect(confirm?.body).not.toMatch(/Myntra|Amazon|\d{4}/);
    expect(buildFamilyShareAttributionConfirm("ab")).toBeNull();
  });
});

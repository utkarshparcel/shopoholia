import { describe, expect, it } from "vitest";
import {
  blurFoundMoneyTotalLabel,
  buildFoundMoneyShareCard,
  buildWhatsAppInFoundMoneyShare,
  formatFoundMoneyAmount,
  FOUND_MONEY_SHARE_WATERMARK,
} from "./found-money.js";
import { redactBrandLabel, redactCardDigits } from "./waste.js";

describe("found-money redact (share guardrails)", () => {
  it("blurs merchant labels", () => {
    expect(redactBrandLabel("Amazon")).toBe("A••••n");
    expect(redactBrandLabel("Myntra")).toBe("M••••a");
    expect(redactBrandLabel("")).toBe("••••");
  });

  it("strips card-like digit runs from merchant strings", () => {
    expect(redactCardDigits("Flipkart 4111 1111 1111 1111")).not.toMatch(/4111/);
    expect(redactBrandLabel("GC 5555-5555-5555-4444")).not.toMatch(/\d{4}/);
  });
});

describe("found-money share card", () => {
  it("formats amount with currency", () => {
    expect(formatFoundMoneyAmount(240_000, "INR")).toContain("₹");
    expect(formatFoundMoneyAmount(18_700, "USD")).toContain("$");
  });

  it("builds share payload with blurred merchants + watermark", () => {
    const card = buildFoundMoneyShareCard({
      totalMinor: 240_000,
      accountCount: 2,
      merchants: ["Myntra", "Amazon", "Myntra"],
      currency: "INR",
    });
    expect(card.headline).toMatch(/forgotten credit/);
    expect(card.amountLabel).toContain("₹");
    expect(card.blurredMerchants).toEqual(["M••••a", "A••••n"]);
    expect(card.watermark).toBe(FOUND_MONEY_SHARE_WATERMARK);
    expect(card.shareText).toContain(FOUND_MONEY_SHARE_WATERMARK);
    expect(card.shareText).not.toMatch(/Myntra|Amazon/);
    expect(card.shareText).not.toMatch(/\d{4}[\s-]?\d{4}/);
  });

  it("includes days-to-deadline without naming the merchant", () => {
    const now = new Date("2026-08-26T10:00:00.000Z");
    const card = buildFoundMoneyShareCard({
      totalMinor: 50_000,
      accountCount: 2,
      accounts: [
        { merchant: "Zara", expiresAt: "2026-09-02T10:00:00.000Z" },
        { merchant: "Nykaa", expiresAt: "2026-08-29T10:00:00.000Z" },
      ],
      now,
    });
    expect(card.daysToNearestExpiry).toBe(3);
    expect(card.deadlineLine).toBe("Soonest card expires in 3 days.");
    expect(card.shareText).toContain("3 days");
    expect(card.shareText).not.toMatch(/Zara|Nykaa/);
    expect(card.blurredMerchants).toEqual(["Z•••", "N•••a"]);
  });

  it("handles zero vault", () => {
    const card = buildFoundMoneyShareCard({ totalMinor: 0, accountCount: 0 });
    expect(card.headline).toBe("Checking my forgotten credit");
    expect(card.shareText).toContain(FOUND_MONEY_SHARE_WATERMARK);
    expect(card.deadlineLine).toBeNull();
  });

  it("formats today and 1-day expiry lines", () => {
    const now = new Date("2026-08-26T10:00:00.000Z");
    const today = buildFoundMoneyShareCard({
      totalMinor: 10_000,
      accountCount: 1,
      // Same instant → daysUntil treats as 0 ("today"/already due)
      accounts: [{ merchant: "Zara", expiresAt: "2026-08-26T10:00:00.000Z" }],
      now,
    });
    expect(today.deadlineLine).toBe("Soonest card expires today.");
    expect(today.shareText).toMatch(/1 gift card/);

    const oneDay = buildFoundMoneyShareCard({
      totalMinor: 10_000,
      accountCount: 1,
      accounts: [{ merchant: "Zara", expiresAt: "2026-08-27T10:00:00.000Z" }],
      now,
    });
    expect(oneDay.deadlineLine).toBe("Soonest card expires in 1 day.");
  });

  it("builds India WhatsApp share with blurred total (W023)", () => {
    const wa = buildWhatsAppInFoundMoneyShare({
      totalMinor: 12_34_00,
      accountCount: 2,
      currency: "INR",
      deepLink: "https://worn.app/r/HOME01",
    });
    expect(wa.amountLabel).toContain("1,234");
    expect(wa.blurredAmountLabel).toBe(blurFoundMoneyTotalLabel(wa.amountLabel));
    expect(wa.blurredAmountLabel).not.toMatch(/\d/);
    expect(wa.shareText).toContain(wa.blurredAmountLabel);
    expect(wa.shareText).not.toMatch(/Myntra|Amazon/);
    expect(wa.whatsAppUrl).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(decodeURIComponent(wa.whatsAppUrl)).toContain("worn.app/r/HOME01");

    const empty = buildWhatsAppInFoundMoneyShare({ totalMinor: 0, accountCount: 0 });
    expect(empty.shareText).toContain("Checking my forgotten credit");
    expect(empty.shareText).toContain("Gift cards & store credit");
  });
});

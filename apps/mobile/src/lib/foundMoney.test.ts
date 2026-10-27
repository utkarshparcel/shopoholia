import { describe, expect, it } from "vitest";
import {
  VAULT_GIFT_EMPTY_BODY,
  assertsManualBeforeEmail,
  connectCelebrationCopy,
  familyFoundMoneyShareFromAccounts,
  familyShareViaLabel,
  foundMoneyCelebrationCopy,
  foundMoneyCurrencySubtotalsLine,
  foundMoneyHeadline,
  foundMoneySubline,
  whatsAppInFoundMoneyShareFromAccounts,
} from "./foundMoney";

describe("foundMoney copy", () => {
  it("headline for zero and positive balances", () => {
    expect(foundMoneyHeadline(0)).toBe("No forgotten credit yet");
    expect(foundMoneyHeadline(125_00)).toContain("forgotten credit");
  });

  it("U005 subtotals line when multiple currencies", () => {
    expect(
      foundMoneyCurrencySubtotalsLine(
        [
          { currency: "INR", totalMinor: 1000 },
          { currency: "USD", totalMinor: 500 },
        ],
        "INR",
      ),
    ).toMatch(/preferred/);
    expect(
      foundMoneyCurrencySubtotalsLine([{ currency: "INR", totalMinor: 1000 }], "INR"),
    ).toBeNull();
  });

  it("subline scales with account count and stays Gmail-optional", () => {
    expect(foundMoneySubline(0)).toMatch(/^Add a card/);
    expect(foundMoneySubline(0)).toMatch(/connect email/i);
    expect(assertsManualBeforeEmail(foundMoneySubline(0))).toBe(true);
    expect(foundMoneySubline(1)).toMatch(/1 gift card/);
    expect(foundMoneySubline(3)).toMatch(/3 gift cards/);
  });

  it("gift empty body leads with manual/sample before email", () => {
    expect(VAULT_GIFT_EMPTY_BODY).toMatch(/Add one gift card|sample/i);
    expect(assertsManualBeforeEmail(VAULT_GIFT_EMPTY_BODY)).toBe(true);
    expect(assertsManualBeforeEmail("Connect email or add a card")).toBe(false);
  });

  it("formats headline with USD", () => {
    expect(foundMoneyHeadline(247_00, "USD")).toMatch(/\$/);
    expect(foundMoneyHeadline(247_00, "USD")).toMatch(/forgotten credit/);
  });

  it("celebration copy branches by source", () => {
    expect(foundMoneyCelebrationCopy(0, "demo")).toMatch(/Sample unlocked/);
    expect(foundMoneyCelebrationCopy(5000, "manual")).toMatch(/is now in your vault/);
    expect(foundMoneyCelebrationCopy(0, "manual")).toMatch(/Card saved/);
    expect(connectCelebrationCopy(0)).toMatch(/scanning/);
    expect(connectCelebrationCopy(9000)).toMatch(/spotted/);
  });
});

describe("W023 WhatsApp IN share", () => {
  it("prefills WA text with blurred total and no merchant/digits", () => {
    const wa = whatsAppInFoundMoneyShareFromAccounts(
      [
        { merchant: "Myntra", expiresAt: null, balanceCacheMinor: 50_000 },
        { merchant: "Amazon", expiresAt: null, balanceCacheMinor: 12_34_00 },
      ],
      { deepLink: "https://worn.app/r/HOME01" },
    );
    expect(wa.blurredAmountLabel).not.toMatch(/\d/);
    expect(wa.shareText).toContain(wa.blurredAmountLabel);
    expect(wa.shareText).not.toMatch(/Myntra|Amazon/);
    expect(wa.shareText).not.toMatch(/\d{4}/);
    expect(wa.whatsAppUrl).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });
});

describe("W024 family share via label", () => {
  it("shows shared via worn.app/r/… attribution", () => {
    const family = familyFoundMoneyShareFromAccounts(
      [{ merchant: "Nykaa", balanceCacheMinor: 10_000 }],
      "FAMILY1",
    );
    expect(familyShareViaLabel(family.deepLink)).toBe(
      "shared via worn.app/r/FAMILY1",
    );
    expect(family.shareText).toContain(family.deepLink);
    expect(family.shareText).not.toMatch(/Nykaa/);
  });
});

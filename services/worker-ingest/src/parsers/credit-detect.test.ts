import { describe, expect, it } from "vitest";
import { detectCreditSignal } from "./credit-detect.js";
import { createDefaultRegistry } from "./index.js";
import { ConsoleMetricsSink } from "./metrics.js";

const ORDER_EMAIL = "Your Amazon.in order 403-1234567-7654321. Order total: ₹4,999.00. Shop gift cards for every occasion.";

describe("phantom gift-card credits", () => {
  it("an order email that mentions gift cards is not a credit", () => {
    expect(detectCreditSignal("Your Amazon.in order", ORDER_EMAIL, 499_900, "INR")).toBeNull();
  });

  it("only the merchant's own domain can put a credit in the vault", () => {
    const registry = createDefaultRegistry(new ConsoleMetricsSink());
    const giftCard = "Your Amazon Pay gift card balance: ₹5,000.00 has been added.";
    const msg = (from: string, subject: string) => ({
      messageId: "m",
      from,
      to: "me@example.com",
      subject,
      text: giftCard,
      receivedAt: "2026-10-20T10:00:00.000Z",
    });
    expect(registry.parse(msg("Amazon.in <gc-orders@amazon.in>", "Your gift card")).purchase?.credit).toMatchObject({
      kind: "GIFT_CARD",
      balanceMinor: 500_000,
    });
    // A stranger's mail with "amazon" in the subject, or on a look-alike domain, mints nothing.
    expect(registry.parse(msg("deals@evil.example", "Amazon gift card")).purchase?.credit).toBeUndefined();
    expect(registry.parse(msg("x@amazon.evil.example", "Gift card")).purchase?.parserId).not.toBe("amazon");
  });
});

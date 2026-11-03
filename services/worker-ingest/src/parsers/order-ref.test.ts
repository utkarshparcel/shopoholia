import { describe, expect, it } from "vitest";
import { createDefaultRegistry } from "./index.js";
import { ConsoleMetricsSink } from "./metrics.js";
import { extractOrderRef } from "./order-ref.js";

describe("extractOrderRef", () => {
  it("never takes an ordinary word after 'order' as the ref", () => {
    expect(extractOrderRef("Order Confirmation")).toBeUndefined();
    expect(extractOrderRef("Thanks! your order has been placed")).toBeUndefined();
    expect(extractOrderRef("order confirmation for Order ID: 12345678")).toBe("12345678");
    expect(extractOrderRef("Order #403-1234567-7654321 shipped")).toBe("403-1234567-7654321");
    expect(extractOrderRef("Order No. FK-77120934")).toBe("FK-77120934");
    expect(extractOrderRef("Your order #ABC12345 total")).toBe("ABC12345");
    expect(extractOrderRef("Receipt #A1B2C3")).toBeUndefined();
    expect(extractOrderRef("Receipt #A1B2C3", { allowBareHash: true })).toBe("A1B2C3");
  });

  it("two Myntra 'Order Confirmation' emails don't share a ref", () => {
    const registry = createDefaultRegistry(new ConsoleMetricsSink());
    const parse = (text: string) =>
      registry.parse({
        messageId: "m",
        from: "updates@myntra.com",
        to: "me@example.com",
        subject: "Order Confirmation",
        text,
        receivedAt: "2026-10-20T10:00:00.000Z",
      }).purchase?.orderRef;
    expect(parse("Hi, your order has been placed. Total: Rs. 1,299.00")).toBeUndefined();
    expect(parse("We got your order confirmation for Order ID: 12345678. Total: Rs. 999.00")).toBe("12345678");
  });
});

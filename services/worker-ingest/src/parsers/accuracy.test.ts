import { describe, expect, it } from "vitest";
import { GenericHeuristicParser, parseAmountMinor } from "./generic.js";
import { AmazonParser } from "./merchants/amazon.js";
import { FlipkartParser } from "./merchants/flipkart.js";
import { MyntraParser } from "./merchants/myntra.js";
import { SwiggyParser } from "./merchants/swiggy.js";
import { ZomatoParser } from "./merchants/zomato.js";
import { createDefaultRegistry } from "./index.js";
import { InMemoryMetricsSink } from "./metrics.js";
import type { RawEmailMessage } from "./types.js";

function msg(partial: Partial<RawEmailMessage> & { text: string }): RawEmailMessage {
  return {
    messageId: "test",
    from: "test@example.com",
    to: "me@example.com",
    subject: "Test",
    receivedAt: new Date(0).toISOString(),
    ...partial,
  };
}

describe("lakh grouping (12,34,567.00)", () => {
  it("parseAmountMinor handles Indian lakh grouping", () => {
    const text = "Grand Total: ₹12,34,567.00";
    expect(parseAmountMinor(text, "INR")).toBe(123456700);
  });

  it("generic parser handles lakh in full email", () => {
    const p = new GenericHeuristicParser();
    const purchase = p.parse(
      msg({
        from: "receipt@shop.com",
        subject: "Your receipt",
        text: "Order total: ₹12,34,567.00\nSubtotal: ₹400.00\nThank you",
      }),
    );
    expect(purchase.totalMinor).toBe(123456700);
  });

  it("base parser (Amazon) handles lakh grouping", () => {
    const parser = new AmazonParser();
    const purchase = parser.parse(
      msg({
        from: "no-reply@amazon.in",
        subject: "Amazon order",
        text: "Grand Total: ₹12,34,567.00\nOrder ID: AMZ-1234",
      }),
    );
    expect(purchase.totalMinor).toBe(123456700);
  });
});

describe("grand-total vs subtotal (word-boundary)", () => {
  it("prefers Grand Total over Subtotal", () => {
    const text = "Subtotal: ₹1,500.00\nGrand Total: ₹1,299.00\nShipping: ₹50.00";
    expect(parseAmountMinor(text, "INR")).toBe(129900);
  });

  it("does not pick Subtotal when Order Total exists", () => {
    const text = "Subtotal: ₹2,000.00\nOrder Total: ₹1,800.00";
    expect(parseAmountMinor(text, "INR")).toBe(180000);
  });

  it("does not confuse Subtotal with Total Amount", () => {
    const text = "Subtotal: ₹999.00\nTotal Amount: ₹1,100.00";
    expect(parseAmountMinor(text, "INR")).toBe(110000);
  });

  it("matches Total Amount with word boundary, not Subtotal", () => {
    const text = "Subtotal: ₹500\nTotal Amount: ₹700.50";
    const parser = new FlipkartParser();
    const purchase = parser.parse(
      msg({
        from: "order@flipkart.com",
        subject: "Flipkart Order",
        text,
      }),
    );
    expect(purchase.totalMinor).toBe(70050);
  });

  it("generic MAX logic picks grand total not max subtotal number", () => {
    const text = "Subtotal: ₹9,999.00\nGrand Total: ₹1,299.00";
    // Without fix, max would be 999900; with fix, should be 129900
    expect(parseAmountMinor(text, "INR")).toBe(129900);
  });

  it("uses word-boundary regex (?:grand\\s+total|order\\s+total|total\\s+amount)\\b", () => {
    const re = /(?:grand\s+total|order\s+total|total\s+amount)\b/i;
    expect(re.test("Subtotal: ₹500")).toBe(false);
    expect(re.test("Grand Total: ₹500")).toBe(true);
    expect(re.test("Order Total: ₹500")).toBe(true);
    expect(re.test("Total Amount: ₹500")).toBe(true);
    expect(re.test("total amount paid")).toBe(true); // contains "total amount" at start
  });
});

describe("currency detection", () => {
  it("detects INR via ₹", () => {
    const p = new GenericHeuristicParser();
    const pur = p.parse(msg({ text: "Order total: ₹500.00", from: "x@x.com", subject: "receipt" }));
    expect(pur.currency).toBe("INR");
  });

  it("detects INR via Rs.", () => {
    const p = new GenericHeuristicParser();
    const pur = p.parse(msg({ text: "Total Amount: Rs. 1,200.00", from: "x@x.com", subject: "receipt" }));
    expect(pur.currency).toBe("INR");
  });

  it("detects INR via INR", () => {
    const p = new GenericHeuristicParser();
    const pur = p.parse(msg({ text: "Total: INR 2,000", from: "x@x.com", subject: "receipt" }));
    expect(pur.currency).toBe("INR");
  });

  it("detects INR via Paid via UPI / UPI", () => {
    const p = new GenericHeuristicParser();
    const pur = p.parse(msg({ text: "Paid via UPI: ₹427.00\nOrder total: ₹427.00", from: "x@x.com", subject: "receipt" }));
    expect(pur.currency).toBe("INR");
    const pur2 = p.parse(msg({ text: "Paid via UPI - Transaction ID 123", from: "x@x.com", subject: "receipt total ₹100" }));
    expect(pur2.currency).toBe("INR");
  });

  it("detects USD via $ and USD", () => {
    const p = new GenericHeuristicParser();
    const pur = p.parse(msg({ text: "Order total: $49.99", from: "x@x.com", subject: "receipt" }));
    expect(pur.currency).toBe("USD");
    const pur2 = p.parse(msg({ text: "Total: USD 99.00", from: "x@x.com", subject: "receipt" }));
    expect(pur2.currency).toBe("USD");
  });

  it("defaults to INR when no currency hint", () => {
    const p = new GenericHeuristicParser();
    const pur = p.parse(msg({ text: "Order total: 500.00", from: "x@x.com", subject: "receipt" }));
    expect(pur.currency).toBe("INR");
  });

  it("base parser currency detection mirrors generic", () => {
    const parser = new MyntraParser();
    const pur = parser.parse(msg({ from: "care@myntra.com", subject: "Myntra", text: "Order total: $20.00" }));
    expect(pur.currency).toBe("USD");
    const pur2 = parser.parse(msg({ from: "care@myntra.com", subject: "Myntra", text: "Order total: ₹500 Paid via UPI" }));
    expect(pur2.currency).toBe("INR");
  });
});

describe("merchant_purchase_items population", () => {
  const parsers = [
    new AmazonParser(),
    new FlipkartParser(),
    new MyntraParser(),
    new SwiggyParser(),
    new ZomatoParser(),
    new GenericHeuristicParser(),
  ];

  for (const parser of parsers) {
    it(`${parser.id} returns at least 1 item`, () => {
      const purchase = parser.parse(
        msg({
          from: parser instanceof GenericHeuristicParser ? "receipt@some-store.com" : `no-reply@${parser.id}.com`,
          subject: `${parser.merchant} order`,
          text: "Hello\nOrder ID: TEST-1234\nGrand Total: ₹1,299.00\nThank you",
        }),
      );
      expect(purchase.items.length).toBeGreaterThanOrEqual(1);
      for (const item of purchase.items) {
        expect(item.title.length).toBeGreaterThan(0);
        expect(item.priceMinor).toBeGreaterThan(0);
        expect(item.qty).toBeGreaterThan(0);
      }
    });
  }

  it("parses explicit '1 x Item - ₹500' pattern", () => {
    const parser = new AmazonParser();
    const purchase = parser.parse(
      msg({
        from: "no-reply@amazon.in",
        subject: "Amazon order",
        text: "1 x Wireless Mouse - ₹799.00\nGrand Total: ₹799.00",
      }),
    );
    expect(purchase.items.length).toBeGreaterThanOrEqual(1);
    expect(purchase.items[0]!.title).toMatch(/Wireless Mouse/i);
    expect(purchase.items[0]!.priceMinor).toBe(79900);
    expect(purchase.items[0]!.qty).toBe(1);
  });

  it("parses 'Qty: 1 Price: ₹500' pattern", () => {
    const parser = new FlipkartParser();
    const purchase = parser.parse(
      msg({
        from: "order@flipkart.com",
        subject: "Flipkart Order",
        text: "Cotton T-Shirt Qty: 2 Price: ₹1,198.00\nGrand Total: ₹1,198.00",
      }),
    );
    expect(purchase.items.length).toBeGreaterThanOrEqual(1);
    const item = purchase.items[0]!;
    expect(item.qty).toBe(2);
    expect(item.priceMinor).toBe(119800);
  });

  it("generic parses bullet items", () => {
    const p = new GenericHeuristicParser();
    const purchase = p.parse(
      msg({
        from: "receipt@bigbasket.com",
        subject: "Your BigBasket invoice",
        text: "• Organic Apples - ₹250.00\n• Milk 1L - ₹60.00\nGrand Total: ₹310.00",
      }),
    );
    expect(purchase.items.length).toBeGreaterThanOrEqual(1);
    // Should parse at least the two bullet lines, but fallback guarantees 1
    expect(purchase.items.some((i) => /Apples/i.test(i.title))).toBe(true);
  });

  it("fallback synthetic item uses totalMinor when no item lines", () => {
    const p = new GenericHeuristicParser();
    const purchase = p.parse(
      msg({
        from: "receipt@unknown.com",
        subject: "receipt",
        text: "Order total: ₹500.00",
      }),
    );
    expect(purchase.items.length).toBe(1);
    expect(purchase.items[0]!.priceMinor).toBe(50000);
  });

  it("generic INR via UPI + ignores subtotal-only max", () => {
    const p = new GenericHeuristicParser();
    const purchase = p.parse(
      msg({
        from: "orders@localshop.test",
        subject: "Payment confirmation",
        text: "Subtotal: 9,999.00\nPaid via UPI\nAmount paid: 120.00",
      }),
    );
    expect(purchase.currency).toBe("INR");
    expect(purchase.totalMinor).toBeLessThan(999900);
  });

  it("base extractTotal prefers amount-paid line over bare numbers", () => {
    const parser = new AmazonParser();
    const purchase = parser.parse(
      msg({
        from: "no-reply@amazon.in",
        subject: "Amazon order",
        text: "Phone 9876543210\nAmount paid ₹450.00\nThanks",
      }),
    );
    expect(purchase.totalMinor).toBe(45000);
  });
});

describe("registry integration for items", () => {
  it("registry parse returns purchase with items", () => {
    const sink = new InMemoryMetricsSink();
    const registry = createDefaultRegistry(sink);
    const result = registry.parse(
      msg({
        from: "no-reply@amazon.in",
        subject: "Your Amazon.in order",
        text: "Order ID: AMZ-1239\nOrder total: ₹1,299.00",
      }),
    );
    expect(result.matched).toBe(true);
    expect(result.purchase!.items.length).toBeGreaterThanOrEqual(1);
  });
});

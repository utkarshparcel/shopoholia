import { describe, expect, it } from "vitest";
import { GenericHeuristicParser } from "./generic.js";
import { AmazonParser } from "./merchants/amazon.js";
import { ParserRegistry } from "./registry.js";
import { InMemoryMetricsSink } from "./metrics.js";
import { createDefaultRegistry } from "./index.js";
import { processEmail } from "../index.js";
import type { RawEmailMessage } from "./types.js";

function msg(partial: Partial<RawEmailMessage>): RawEmailMessage {
  return {
    messageId: "m",
    from: "no-reply@x.com",
    to: "me@example.com",
    subject: "",
    text: "",
    receivedAt: new Date(0).toISOString(),
    ...partial,
  };
}

describe("GenericHeuristicParser", () => {
  const parser = new GenericHeuristicParser();

  it("detects receipt-ish messages by subject/text hints", () => {
    expect(parser.canParse(msg({ subject: "Your order receipt" }))).toBe(true);
    expect(parser.canParse(msg({ text: "Please see your invoice" }))).toBe(true);
    expect(parser.canParse(msg({ text: "total amount due" }))).toBe(true);
  });

  it("detects a decimal amount even without explicit hints", () => {
    expect(parser.canParse(msg({ text: "Charged 12.34 for your subscription" }))).toBe(true);
  });

  it("does not match unrelated mail", () => {
    expect(parser.canParse(msg({ subject: "Hello", text: "How are you?" }))).toBe(false);
  });

  it("parses currency, total and order ref", () => {
    const purchase = parser.parse(
      msg({
        from: "receipt@some-store.com",
        text: "Your order #ABC12345 total ₹1,299.00",
      }),
    );
    expect(purchase.currency).toBe("INR");
    expect(purchase.totalMinor).toBe(129900);
    expect(purchase.orderRef).toBe("ABC12345");
    expect(purchase.merchant).toBe("SOME-STORE.COM");
    expect(purchase.confidence).toBeLessThan(1);
  });

  it("defaults to USD when no rupee hint is present", () => {
    const purchase = parser.parse(msg({ text: "Order total: $49.99" }));
    expect(purchase.currency).toBe("USD");
    expect(purchase.totalMinor).toBe(4999);
  });
});

describe("BaseMerchantParser (Amazon)", () => {
  const parser = new AmazonParser();

  it("matches by domain", () => {
    expect(parser.canParse(msg({ from: "no-reply@amazon.in" }))).toBe(true);
  });

  it("matches by subject keyword", () => {
    expect(parser.canParse(msg({ subject: "Your Amazon order" }))).toBe(true);
  });

  it("does not match unrelated mail", () => {
    expect(parser.canParse(msg({ from: "hi@other.com", subject: "Hi" }))).toBe(false);
  });

  it("extracts a total and order ref heuristically", () => {
    const purchase = parser.parse(
      msg({ text: "Your order #A1B2C3 total 2,499.00" }),
    );
    expect(purchase.merchant).toBe("AMAZON");
    expect(purchase.totalMinor).toBe(249900);
    expect(purchase.orderRef).toBe("A1B2C3");
  });
});

describe("ParserRegistry", () => {
  it("lists registered parser ids with generic last", () => {
    const registry = createDefaultRegistry(new InMemoryMetricsSink());
    const ids = registry.list();
    expect(ids).toContain("amazon");
    expect(ids[ids.length - 1]).toBe("generic");
  });

  it("returns a miss when nothing matches and records a coverage event", () => {
    const sink = new InMemoryMetricsSink();
    const registry = new ParserRegistry(
      [new AmazonParser(), new GenericHeuristicParser()],
      sink,
    );
    const result = registry.parse(msg({ from: "hi@other.com", text: "Just saying hi" }));
    expect(result.matched).toBe(false);
    expect(result.parserId).toBeUndefined();
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toMatchObject({ matched: false, parserId: null, specific: false });
  });
});

describe("processEmail", () => {
  it("runs a message through the framework and records coverage", async () => {
    const sink = new InMemoryMetricsSink();
    await processEmail(
      msg({ from: "no-reply@amazon.in", subject: "Amazon order shipped" }),
      { metrics: sink },
    );
    expect(sink.events.length).toBe(1);
    expect(sink.events[0]?.parserId).toBe("amazon");
  });
});

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createDefaultRegistry } from "./index.js";
import { GenericHeuristicParser } from "./generic.js";
import { InMemoryMetricsSink } from "./metrics.js";
import { parseEml } from "../spikes/parser-accuracy/fixtures/load.js";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "../spikes/parser-accuracy/fixtures");

describe("parser framework", () => {
  it("matches a dedicated merchant parser and emits a coverage metric", () => {
    const sink = new InMemoryMetricsSink();
    const registry = createDefaultRegistry(sink);
    const msg = parseEml(
      readFileSync(join(FIX, "amazon.eml"), "utf8"),
      "amazon.eml",
    );
    const result = registry.parse(msg);
    expect(result.matched).toBe(true);
    expect(result.parserId).toBe("amazon");
    expect(sink.events.length).toBe(1);
    expect(sink.events[0]).toMatchObject({
      parserId: "amazon",
      specific: true,
    });
    expect(typeof sink.events[0]?.messageId).toBe("string");
  });

  it("generic parser handles a basic receipt end-to-end", () => {
    const generic = new GenericHeuristicParser();
    const msg = {
      messageId: "basic-1",
      from: "receipt@some-store.com",
      to: "me@example.com",
      subject: "Your receipt",
      text: "Thanks for your order. Order total: ₹1,299.00",
      receivedAt: new Date(0).toISOString(),
    };
    expect(generic.canParse(msg)).toBe(true);
    const purchase = generic.parse(msg);
    expect(purchase.currency).toBe("INR");
    expect(purchase.totalMinor).toBe(129900);
    expect(purchase.merchant).toBe("SOME-STORE.COM");
  });

  it("emits a coverage metric for every fixture message", () => {
    const sink = new InMemoryMetricsSink();
    const registry = createDefaultRegistry(sink);
    const files = [
      "flipkart.eml",
      "myntra.eml",
      "swiggy.eml",
      "zomato.eml",
      "generic-receipt.eml",
      "unknown-promo.eml",
    ];
    for (const file of files) {
      const msg = parseEml(readFileSync(join(FIX, file), "utf8"), file);
      registry.parse(msg);
    }
    expect(sink.events.length).toBe(files.length);
    expect(sink.specificHits()).toBe(4);
  });
});

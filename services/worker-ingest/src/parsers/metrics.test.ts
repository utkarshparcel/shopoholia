import { describe, expect, it, vi } from "vitest";
import { ConsoleMetricsSink, InMemoryMetricsSink } from "./metrics.js";
import type { CoverageEvent } from "./types.js";

describe("InMemoryMetricsSink", () => {
  it("records events and exposes them", () => {
    const sink = new InMemoryMetricsSink();
    const ev: CoverageEvent = {
      messageId: "m1",
      parserId: "amazon",
      matched: true,
      merchant: "AMAZON",
      specific: true,
    };
    sink.record(ev);
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toEqual(ev);
  });

  it("counts specific hits (dedicated parser matches)", () => {
    const sink = new InMemoryMetricsSink();
    sink.record({
      messageId: "m1",
      parserId: "amazon",
      matched: true,
      merchant: "AMAZON",
      specific: true,
    });
    sink.record({
      messageId: "m2",
      parserId: "generic",
      matched: true,
      merchant: "X",
      specific: false,
    });
    sink.record({
      messageId: "m3",
      parserId: null,
      matched: false,
      merchant: null,
      specific: false,
    });
    expect(sink.specificHits()).toBe(1);
  });

  it("counts total misses (unmatched messages)", () => {
    const sink = new InMemoryMetricsSink();
    sink.record({
      messageId: "m1",
      parserId: "amazon",
      matched: true,
      merchant: "AMAZON",
      specific: true,
    });
    sink.record({
      messageId: "m2",
      parserId: null,
      matched: false,
      merchant: null,
      specific: false,
    });
    sink.record({
      messageId: "m3",
      parserId: null,
      matched: false,
      merchant: null,
      specific: false,
    });
    expect(sink.totalMisses()).toBe(2);
  });
});

describe("ConsoleMetricsSink", () => {
  it("logs each coverage event", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const sink = new ConsoleMetricsSink();
    sink.record({
      messageId: "m1",
      parserId: "amazon",
      matched: true,
      merchant: "AMAZON",
      specific: true,
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toContain("hit");
    spy.mockRestore();
  });
});

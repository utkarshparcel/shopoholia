import { afterEach, describe, expect, it, vi } from "vitest";
import {
  initServerAnalyticsFromEnv,
  resetServerAnalyticsSink,
  setServerAnalyticsSink,
  trackServerEvent,
} from "./analytics.js";

describe("server analytics unit", () => {
  afterEach(() => {
    resetServerAnalyticsSink();
    delete process.env.ANALYTICS_WEBHOOK_URL;
    delete process.env.POSTHOG_KEY;
  });

  it("forwards events to the configured sink, strips PII, and never throws on bad sink", () => {
    const seen: Array<{ name: string; props?: Record<string, unknown> }> = [];
    setServerAnalyticsSink((name, properties) => {
      seen.push({ name, props: properties });
    });
    trackServerEvent("consent_granted", { userId: "u1", email: "a@b.co" });
    expect(seen).toEqual([
      { name: "consent_granted", props: { userId: "u1" } },
    ]);
    setServerAnalyticsSink(() => {
      throw new Error("boom");
    });
    expect(() => trackServerEvent("vault_deleted")).not.toThrow();
  });

  it("initServerAnalyticsFromEnv installs HTTP sink from ANALYTICS_WEBHOOK_URL", async () => {
    process.env.ANALYTICS_WEBHOOK_URL = "https://hooks.example/api";
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    try {
      expect(initServerAnalyticsFromEnv()).toBe(true);
      trackServerEvent("ingestion_connected", { kind: "EMAIL" });
      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
      expect(fetchImpl.mock.calls[0]![0]).toBe("https://hooks.example/api");
    } finally {
      globalThis.fetch = original;
    }
  });
});

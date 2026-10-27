import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ANALYTICS_EVENTS,
  AnalyticsEventNameSchema,
  CLOSET_FUNNEL_EVENTS,
  WAVE_A_WOW_EVENTS,
  RevealRatingBodySchema,
  RevealRatingResponseSchema,
  createHttpAnalyticsSink,
  sanitizeAnalyticsProperties,
} from "./analytics.js";

describe("analytics schemas", () => {
  it("defines the Phase I funnel events first", () => {
    expect(ANALYTICS_EVENTS.slice(0, 15)).toEqual([
      "install",
      "avatar_complete",
      "add_to_cart",
      "checkout",
      "wait_complete",
      "reveal_opened",
      "reveal_rated",
      "unlock",
      "share",
      "affiliate_click",
      "iap_purchase",
      "generate_render",
      "rush_to_express",
      "push_permission",
      "push_opened",
    ]);
  });

  it("keeps unique event names and Closet funnel coverage", () => {
    expect(new Set(ANALYTICS_EVENTS).size).toBe(ANALYTICS_EVENTS.length);
    expect(ANALYTICS_EVENTS).toContain("install");
    expect(ANALYTICS_EVENTS).toContain("found_money_viewed");
    for (const name of CLOSET_FUNNEL_EVENTS) {
      expect(ANALYTICS_EVENTS).toContain(name);
    }
  });

  it("covers Wave A WOW event names for shared sinks", () => {
    for (const name of WAVE_A_WOW_EVENTS) {
      expect(ANALYTICS_EVENTS).toContain(name);
      expect(AnalyticsEventNameSchema.parse(name)).toBe(name);
    }
    expect([...WAVE_A_WOW_EVENTS]).toEqual([
      "demo_exited",
      "onboarding_skipped",
      "email_prompt_skipped",
      "empty_cta_tap",
      "add_another_tap",
      "return_portal_open",
    ]);
  });

  it("validates event names", () => {
    expect(AnalyticsEventNameSchema.parse("checkout")).toBe("checkout");
    expect(AnalyticsEventNameSchema.parse("found_money_viewed")).toBe(
      "found_money_viewed",
    );
    expect(AnalyticsEventNameSchema.parse("consent_granted")).toBe(
      "consent_granted",
    );
    expect(AnalyticsEventNameSchema.parse("ingestion_connected")).toBe(
      "ingestion_connected",
    );
    expect(AnalyticsEventNameSchema.parse("ingestion_source_disconnected")).toBe(
      "ingestion_source_disconnected",
    );
    expect(AnalyticsEventNameSchema.parse("onboarding_skipped")).toBe(
      "onboarding_skipped",
    );
    expect(AnalyticsEventNameSchema.parse("email_prompt_skipped")).toBe(
      "email_prompt_skipped",
    );
    expect(() => AnalyticsEventNameSchema.parse("unknown")).toThrow();
  });

  it("validates reveal rating payloads", () => {
    expect(RevealRatingBodySchema.parse({ rating: "loved" })).toEqual({
      rating: "loved",
    });
    expect(() => RevealRatingBodySchema.parse({ rating: "bad" })).toThrow();
  });

  it("validates reveal rating responses", () => {
    const response = RevealRatingResponseSchema.parse({
      orderId: "11111111-1111-4111-8111-111111111111",
      rating: "ok",
      recorded: true,
    });
    expect(response.rating).toBe("ok");
  });
});

describe("sanitizeAnalyticsProperties / funnel", () => {
  it("defines Closet funnel events install→connect→found_money→habit", () => {
    expect([...CLOSET_FUNNEL_EVENTS]).toEqual([
      "install",
      "ingestion_connected",
      "found_money_viewed",
      "time_to_found_money",
      "wear_logged",
      "outfit_viewed",
    ]);
  });

  it("strips PII keys and redacts emails/phones/long digits", () => {
    expect(sanitizeAnalyticsProperties()).toEqual({});
    expect(sanitizeAnalyticsProperties(undefined)).toEqual({});
    const safe = sanitizeAnalyticsProperties({
      email: "user@example.com",
      phone: "+91 98765 43210",
      token: "secret",
      accountId: "acct-1",
      note: "reach me at user@example.com or +919876543210",
      cardHint: "4111111111111111",
      amountMinor: 500,
    });
    expect(safe.email).toBeUndefined();
    expect(safe.phone).toBeUndefined();
    expect(safe.token).toBeUndefined();
    expect(safe.accountId).toBe("acct-1");
    expect(safe.amountMinor).toBe(500);
    expect(String(safe.note)).not.toMatch(/@/);
    expect(String(safe.note)).toContain("[redacted_email]");
    expect(String(safe.cardHint)).toBe("[redacted_digits]");
  });
});

describe("createHttpAnalyticsSink", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when no webhook or PostHog key is set", () => {
    expect(createHttpAnalyticsSink({})).toBeNull();
    expect(createHttpAnalyticsSink({ webhookUrl: "  " })).toBeNull();
  });

  it("POSTs to the webhook URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const sink = createHttpAnalyticsSink({
      webhookUrl: "https://hooks.example/analytics",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(sink).not.toBeNull();
    sink!("consent_granted", { scope: "EMAIL" });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://hooks.example/analytics",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = JSON.parse(
      (fetchImpl.mock.calls[0]![1] as { body: string }).body,
    ) as { name: string; properties: { scope: string } };
    expect(body.name).toBe("consent_granted");
    expect(body.properties.scope).toBe("EMAIL");
  });

  it("scrubs PII before POSTing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const sink = createHttpAnalyticsSink({
      webhookUrl: "https://hooks.example/analytics",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    sink!("credit_added", {
      email: "a@b.co",
      merchant: "Amazon",
      amountMinor: 100,
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const body = JSON.parse(
      (fetchImpl.mock.calls[0]![1] as { body: string }).body,
    ) as { properties: Record<string, unknown> };
    expect(body.properties.email).toBeUndefined();
    expect(body.properties.merchant).toBe("Amazon");
  });

  it("POSTs to PostHog capture when only a key is set", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const sink = createHttpAnalyticsSink({
      posthogKey: "phc_test",
      posthogHost: "https://eu.i.posthog.com",
      distinctId: "user-1",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    sink!("found_money_viewed");
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "https://eu.i.posthog.com/capture/",
    );
    const body = JSON.parse(
      (fetchImpl.mock.calls[0]![1] as { body: string }).body,
    ) as { api_key: string; event: string; distinct_id: string };
    expect(body.api_key).toBe("phc_test");
    expect(body.event).toBe("found_money_viewed");
    expect(body.distinct_id).toBe("user-1");
  });

  it("prefers webhook over PostHog when both are set", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const sink = createHttpAnalyticsSink({
      webhookUrl: "https://hooks.example/a",
      posthogKey: "phc_test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    sink!("ingestion_connected");
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(fetchImpl.mock.calls[0]![0]).toBe("https://hooks.example/a");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/node", () => ({ init: vi.fn(), captureException: vi.fn() }));

/** A fresh copy of the module, so each test starts uninitialized. */
async function loadSentry() {
  vi.resetModules();
  const Sentry = await import("@sentry/node");
  const wrapper = await import("./sentry.js");
  return { Sentry: vi.mocked(Sentry), ...wrapper };
}

describe("sentry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does nothing without SENTRY_DSN", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    const { Sentry, initSentry, captureException } = await loadSentry();

    initSentry();
    captureException(new Error("boom"), { route: "/x" });

    expect(Sentry.init).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("initializes once and forwards errors with their tags", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@o0.ingest.sentry.io/1");
    vi.stubEnv("NODE_ENV", "production");
    const { Sentry, initSentry, captureException } = await loadSentry();

    initSentry();
    initSentry();
    const error = new Error("boom");
    captureException(error, { route: "/orders/:id" });
    captureException(error);

    expect(Sentry.init).toHaveBeenCalledOnce();
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: "https://key@o0.ingest.sentry.io/1", environment: "production" }),
    );
    expect(Sentry.captureException).toHaveBeenNthCalledWith(1, error, { tags: { route: "/orders/:id" } });
    expect(Sentry.captureException).toHaveBeenNthCalledWith(2, error, undefined);
  });
});

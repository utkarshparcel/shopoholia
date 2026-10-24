import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/node", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  fastifyIntegration: vi.fn((options: object) => ({ name: "Fastify", options })),
}));

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
    captureException(new Error("boom"), { tags: { route: "/x" } });

    expect(Sentry.init).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("initializes once, leaving request errors to our onError hook", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@o0.ingest.sentry.io/1");
    vi.stubEnv("NODE_ENV", "production");
    const { Sentry, initSentry } = await loadSentry();

    initSentry();
    initSentry();

    expect(Sentry.init).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        dsn: "https://key@o0.ingest.sentry.io/1",
        environment: "production",
        integrations: [expect.objectContaining({ name: "Fastify" })],
      }),
    );
    const [options] = Sentry.fastifyIntegration.mock.calls[0]!;
    expect(options?.shouldHandleError?.(new Error("boom"), {} as never, { statusCode: 500 } as never)).toBe(
      false,
    );
  });

  it("forwards errors with their tags, flagging unhandled ones", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@o0.ingest.sentry.io/1");
    const { Sentry, initSentry, captureException } = await loadSentry();
    initSentry();
    const error = new Error("boom");

    captureException(error, { tags: { route: "/orders/:id" }, unhandled: true });
    captureException(error, { tags: { job: "render" } });
    captureException(error);

    expect(Sentry.captureException.mock.calls).toEqual([
      [
        error,
        {
          captureContext: { tags: { route: "/orders/:id" } },
          mechanism: { type: "fastify", handled: false },
        },
      ],
      [error, { captureContext: { tags: { job: "render" } } }],
      [error, {}],
    ]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

const init = vi.fn();
const captureException = vi.fn();
const captureMessage = vi.fn();
const withScope = vi.fn((cb: (scope: { setTags: (t: Record<string, string>) => void }) => void) => {
  cb({ setTags: vi.fn() });
});

vi.mock("@sentry/node", () => ({
  init,
  captureException,
  captureMessage,
  withScope,
}));

describe("node-sentry", () => {
  afterEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_SMOKE;
  });

  it("no-ops without SENTRY_DSN", async () => {
    const { initNodeSentry, captureNodeException } = await import("./node-sentry.js");
    expect(initNodeSentry({ worker: "expiry" })).toBe(false);
    captureNodeException(new Error("x"));
    expect(init).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("inits with worker tags and captures failures", async () => {
    process.env.SENTRY_DSN = "https://examplePublicKey@o0.ingest.sentry.io/0";
    const {
      initNodeSentry,
      captureNodeException,
      attachBullmqFailureReporting,
      resetNodeSentryForTests,
    } = await import("./node-sentry.js");

    expect(initNodeSentry({ worker: "expiry" })).toBe(true);
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: process.env.SENTRY_DSN,
        initialScope: {
          tags: { worn_surface: "worker", worker: "expiry" },
        },
      }),
    );

    captureNodeException(new Error("boom"), { job_id: "1" });
    expect(withScope).toHaveBeenCalled();
    expect(captureException).toHaveBeenCalled();

    const on = vi.fn();
    attachBullmqFailureReporting({ on }, "expiry");
    expect(on).toHaveBeenCalledWith("failed", expect.any(Function));
    const listener = on.mock.calls[0]![1] as (job: { id?: string }, err: Error) => void;
    listener({ id: "job-9" }, new Error("failed"));
    expect(captureException).toHaveBeenCalled();

    resetNodeSentryForTests();
  });

  it("emits smoke message when SENTRY_SMOKE=1", async () => {
    process.env.SENTRY_DSN = "https://examplePublicKey@o0.ingest.sentry.io/0";
    process.env.SENTRY_SMOKE = "1";
    const { initNodeSentry, resetNodeSentryForTests } = await import("./node-sentry.js");
    initNodeSentry({ worker: "ingest" });
    expect(captureMessage).toHaveBeenCalledWith("worn.smoke.worker.ingest", "info");
    resetNodeSentryForTests();
  });
});

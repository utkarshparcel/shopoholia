import * as Sentry from "@sentry/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "../index.js";
import { errorStatusCode, reportJobError } from "./error-reporting.js";
import { createMemoryRepositories } from "./repositories/memory.js";
import { initSentry } from "./sentry.js";

vi.mock("@sentry/node", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  fastifyIntegration: vi.fn(() => ({ name: "Fastify" })),
}));

const captureException = vi.mocked(Sentry.captureException);

beforeAll(() => {
  vi.stubEnv("SENTRY_DSN", "https://key@o0.ingest.sentry.io/1");
  initSentry();
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  captureException.mockClear();
});

describe("onError hook", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  const unavailable = Object.assign(new Error("upstream down"), { statusCode: 503 });

  beforeAll(async () => {
    app = await buildServer({ deps: { repos: createMemoryRepositories() }, logger: false });
    app.get("/test/orders/:id", async () => {
      throw new Error("boom");
    });
    app.get("/test/unavailable", async () => {
      throw unavailable;
    });
    app.get("/test/conflict", async (_request, reply) => {
      reply.code(409);
      throw new Error("already placed");
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("reports an unexpected error with the request id, method and route, and leaves the 500 as is", async () => {
    const res = await app.inject({ method: "GET", url: "/test/orders/abc?token=secret" });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      statusCode: 500,
      error: "Internal Server Error",
      message: "boom",
    });
    expect(captureException).toHaveBeenCalledExactlyOnceWith(new Error("boom"), {
      captureContext: {
        tags: {
          request_id: expect.stringMatching(/^req-/),
          method: "GET",
          route: "/test/orders/:id",
          status_code: "500",
        },
      },
      mechanism: { type: "fastify", handled: false },
    });
  });

  it("reports errors that carry a 5xx status", async () => {
    const res = await app.inject({ method: "GET", url: "/test/unavailable" });

    expect(res.statusCode).toBe(503);
    expect(captureException).toHaveBeenCalledExactlyOnceWith(
      unavailable,
      expect.objectContaining({
        captureContext: {
          tags: expect.objectContaining({ route: "/test/unavailable", status_code: "503" }),
        },
      }),
    );
  });

  it("skips expected 4xx errors", async () => {
    const responses = await Promise.all([
      app.inject({ method: "GET", url: "/health" }),
      app.inject({ method: "GET", url: "/no-such-route" }),
      app.inject({ method: "POST", url: "/auth/otp", payload: { phone: "1" } }),
      app.inject({
        method: "POST",
        url: "/auth/otp",
        headers: { "content-type": "application/json" },
        payload: "{not json",
      }),
      app.inject({ method: "GET", url: "/test/conflict" }),
    ]);

    expect(responses.map((res) => res.statusCode)).toEqual([200, 404, 400, 400, 409]);
    expect(captureException).not.toHaveBeenCalled();
  });
});

describe("errorStatusCode", () => {
  it.each([
    [{}, 200, 500],
    [{ statusCode: 400 }, 200, 400],
    [{ status: 404 }, 200, 404],
    [{ statusCode: 302 }, 200, 500],
    [{ statusCode: 400 }, 409, 409],
    [{}, 503, 503],
  ])("error %o with reply status %i answers %i", (fields, replyStatus, expected) => {
    const error = Object.assign(new Error("x"), fields);
    expect(errorStatusCode(error, { statusCode: replyStatus })).toBe(expected);
  });
});

describe("reportJobError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the failure and reports it tagged with the job kind and ids", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("provider timeout");

    reportJobError(error, { kind: "render", ids: { renderId: "render-1", orderId: "order-1" } });

    expect(consoleError).toHaveBeenCalledWith(
      "[jobs] render job failed",
      { renderId: "render-1", orderId: "order-1" },
      error,
    );
    expect(captureException).toHaveBeenCalledExactlyOnceWith(error, {
      captureContext: { tags: { job: "render", renderId: "render-1", orderId: "order-1" } },
    });
  });
});

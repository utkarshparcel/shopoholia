import { describe, expect, it, vi } from "vitest";
import {
  createFashnClient,
  creditsToMicros,
  FashnApiError,
  FASHN_CREDIT_MICROS,
} from "./fashn-client.js";

describe("creditsToMicros", () => {
  it("converts credits using the fixed micros rate", () => {
    expect(creditsToMicros(3)).toBe(3 * FASHN_CREDIT_MICROS);
  });
});

describe("createFashnClient", () => {
  it("submits tryon-max and polls until completed", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = typeof url === "string" ? url : url.toString();

      if (href.endsWith("/run")) {
        expect(init?.method).toBe("POST");
        const body = JSON.parse(String(init?.body)) as {
          model_name: string;
          inputs: { model_image: string; product_image: string };
        };
        expect(body.model_name).toBe("tryon-max");
        expect(body.inputs.model_image).toBe("data:image/jpeg;base64,abc");
        expect(body.inputs.product_image).toBe("https://example.com/g.jpg");
        return new Response(JSON.stringify({ id: "pred-1", error: null }), { status: 200 });
      }

      if (href.endsWith("/status/pred-1")) {
        return new Response(
          JSON.stringify({
            id: "pred-1",
            status: "completed",
            output: ["https://cdn.fashn.ai/pred-1/output_0.jpg"],
            error: null,
          }),
          {
            status: 200,
            headers: { "x-fashn-credits-used": "3" },
          },
        );
      }

      throw new Error(`Unexpected fetch: ${href}`);
    });

    const client = createFashnClient({
      apiKey: "test-key",
      fetchImpl,
      pollIntervalMs: 0,
    });

    const result = await client.tryOnMax({
      modelImage: "data:image/jpeg;base64,abc",
      productImage: "https://example.com/g.jpg",
    });

    expect(result.predictionId).toBe("pred-1");
    expect(result.outputUrl).toContain("output_0.jpg");
    expect(result.creditsUsed).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("polls through in-progress states", async () => {
    let statusCalls = 0;
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const href = typeof url === "string" ? url : url.toString();

      if (href.endsWith("/run")) {
        return new Response(JSON.stringify({ id: "pred-2" }), { status: 200 });
      }

      statusCalls += 1;
      if (statusCalls === 1) {
        return new Response(JSON.stringify({ id: "pred-2", status: "processing" }), {
          status: 200,
        });
      }

      return new Response(
        JSON.stringify({
          id: "pred-2",
          status: "completed",
          output: ["https://cdn.fashn.ai/pred-2/output_0.jpg"],
        }),
        {
          status: 200,
          headers: { "x-fashn-credits-used": "4" },
        },
      );
    });

    const client = createFashnClient({
      apiKey: "test-key",
      fetchImpl,
      pollIntervalMs: 0,
    });

    const result = await client.tryOnMax({
      modelImage: "https://example.com/model.jpg",
      productImage: "https://example.com/garment.jpg",
    });

    expect(result.creditsUsed).toBe(4);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("throws on failed prediction", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const href = typeof url === "string" ? url : url.toString();
      if (href.endsWith("/run")) {
        return new Response(JSON.stringify({ id: "pred-fail" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          id: "pred-fail",
          status: "failed",
          error: { name: "ImageLoadError", message: "Invalid garment image" },
        }),
        { status: 200 },
      );
    });

    const client = createFashnClient({
      apiKey: "test-key",
      fetchImpl,
      pollIntervalMs: 0,
    });

    await expect(
      client.tryOnMax({
        modelImage: "https://example.com/model.jpg",
        productImage: "https://example.com/garment.jpg",
      }),
    ).rejects.toThrow("Invalid garment image");
  });

  it("throws on auth errors from /run", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({ error: "UnauthorizedAccess", message: "Unauthorized: Invalid token" }),
        { status: 401 },
      );
    });

    const client = createFashnClient({ apiKey: "bad-key", fetchImpl, pollIntervalMs: 0 });

    await expect(
      client.tryOnMax({
        modelImage: "https://example.com/model.jpg",
        productImage: "https://example.com/garment.jpg",
      }),
    ).rejects.toBeInstanceOf(FashnApiError);
  });
});

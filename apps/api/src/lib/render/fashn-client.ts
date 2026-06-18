export type FashnFetch = typeof fetch;

export type FashnClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FashnFetch;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
};

export type TryOnMaxInput = {
  modelImage: string;
  productImage: string;
  resolution?: "1k" | "2k" | "4k";
  generationMode?: "balanced" | "quality";
};

export type TryOnMaxResult = {
  outputUrl: string;
  creditsUsed: number;
  predictionId: string;
  durationMs: number;
};

export const FASHN_BASE_URL = "https://api.fashn.ai/v1";
export const FASHN_CREDIT_MICROS = 25_000;

export function creditsToMicros(credits: number): number {
  return Math.round(credits * FASHN_CREDIT_MICROS);
}

type RunResponse = {
  id?: string;
  error?: string | null;
};

type StatusResponse = {
  id?: string;
  status?: string;
  output?: string[];
  error?: { name?: string; message?: string } | null;
};

export class FashnApiError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "FashnApiError";
  }
}

export function createFashnClient(options: FashnClientOptions) {
  const baseUrl = options.baseUrl ?? FASHN_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const pollIntervalMs = options.pollIntervalMs ?? 3_000;
  const maxPollAttempts = options.maxPollAttempts ?? 60;

  async function runTryOnMax(input: TryOnMaxInput): Promise<string> {
    const response = await fetchImpl(`${baseUrl}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model_name: "tryon-max",
        inputs: {
          model_image: input.modelImage,
          product_image: input.productImage,
          resolution: input.resolution ?? "2k",
          generation_mode: input.generationMode ?? "balanced",
          output_format: "jpeg",
        },
      }),
    });

    const body = (await response.json()) as RunResponse & { message?: string };
    if (!response.ok) {
      throw new FashnApiError(
        body.message ?? body.error ?? `FASHN /run failed (${response.status})`,
        body,
      );
    }
    if (!body.id) {
      throw new FashnApiError("FASHN /run returned no prediction id", body);
    }
    return body.id;
  }

  async function pollUntilComplete(predictionId: string): Promise<{
    outputUrl: string;
    creditsUsed: number;
  }> {
    for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
      const response = await fetchImpl(`${baseUrl}/status/${predictionId}`, {
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
        },
      });

      const body = (await response.json()) as StatusResponse;
      if (!response.ok) {
        throw new FashnApiError(
          `FASHN /status failed (${response.status})`,
          body,
        );
      }

      const status = body.status;
      if (status === "completed") {
        const outputUrl = body.output?.[0];
        if (!outputUrl) {
          throw new FashnApiError("FASHN completed without output URL", body);
        }
        const creditsHeader = response.headers.get("x-fashn-credits-used");
        const creditsUsed = creditsHeader ? Number(creditsHeader) : 0;
        return { outputUrl, creditsUsed };
      }

      if (status === "failed") {
        const message = body.error?.message ?? "FASHN prediction failed";
        throw new FashnApiError(message, body.error);
      }

      if (attempt < maxPollAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }

    throw new FashnApiError(`FASHN prediction timed out after ${maxPollAttempts} polls`);
  }

  return {
    async tryOnMax(input: TryOnMaxInput): Promise<TryOnMaxResult> {
      const startedAt = Date.now();
      const predictionId = await runTryOnMax(input);
      const { outputUrl, creditsUsed } = await pollUntilComplete(predictionId);
      return {
        outputUrl,
        creditsUsed,
        predictionId,
        durationMs: Date.now() - startedAt,
      };
    },
  };
}

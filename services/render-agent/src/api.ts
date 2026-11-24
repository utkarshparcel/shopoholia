import { readFile, writeFile } from "node:fs/promises";
import type { RenderScenario } from "./mediagen.js";

/** A leased job: ids and signed URLs only (the API sends no user data). */
export type LeasedJob = {
  id: string;
  kind: "render" | "tryon";
  scenario: RenderScenario | null;
  attempt: number;
  leaseExpiresAt: string;
  modelImageUrl: string;
  garmentImageUrls: string[];
  output: { url: string; method: "PUT"; contentType: string };
};

export type Fetch = typeof fetch;

/** An HTTP failure; `status` is undefined for a network error. */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const API_TIMEOUT_MS = 30_000;
const TRANSFER_TIMEOUT_MS = 120_000;

export function createApiClient(options: { apiUrl: string; token: string; agentId: string; fetch?: Fetch }) {
  const fetchImpl = options.fetch ?? fetch;

  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetchImpl(`${options.apiUrl}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${options.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!res.ok) throw new HttpError(`POST ${path} answered ${res.status}`, res.status);
    return (await res.json()) as T;
  }

  return {
    async heartbeat(version: string) {
      await post("/agent/heartbeat", { agentId: options.agentId, version });
    },
    async lease(max: number): Promise<LeasedJob[]> {
      const { jobs } = await post<{ jobs: LeasedJob[] }>("/agent/renders/lease", { max, agentId: options.agentId });
      return jobs;
    },
    async complete(id: string) {
      await post(`/agent/renders/${id}/complete`, { agentId: options.agentId });
    },
    async fail(id: string, retryable: boolean, reason: string) {
      await post(`/agent/renders/${id}/fail`, { agentId: options.agentId, retryable, reason: reason.slice(0, 500) });
    },
    /** GETs a signed input URL to `path`. */
    async download(url: string, path: string) {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS) });
      if (!res.ok) throw new HttpError(`input download answered ${res.status}`, res.status);
      await writeFile(path, new Uint8Array(await res.arrayBuffer()), { mode: 0o600 });
    },
    /** PUTs `path` to the signed output URL. */
    async upload(url: string, path: string, contentType: string) {
      const body = await readFile(path);
      const res = await fetchImpl(url, {
        method: "PUT",
        headers: { "content-type": contentType },
        body,
        signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS),
      });
      if (!res.ok) throw new HttpError(`output upload answered ${res.status}`, res.status);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

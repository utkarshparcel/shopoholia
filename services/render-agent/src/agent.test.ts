import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createApiClient, type LeasedJob } from "./api.js";
import { isRetryable, runAgentLoop, runJob } from "./agent.js";
import { loadConfig } from "./config.js";
import {
  createDryRunEngine,
  createMediagenEngine,
  MediagenNotConfiguredError,
  promptFor,
  RenderRejectedError,
  SCENARIO_PROMPTS,
  type RenderEngine,
} from "./mediagen.js";
import { decodeImage, QualityCheckError, sniffFormat } from "./quality.js";
import { flat, photo, toJpeg } from "./test-images.js";
import { parseWindow } from "./window.js";

const API = "https://api.worn.test";
const MODEL_BYTES = toJpeg(photo(640, 960));

function job(id = "11111111-1111-4111-8111-111111111111"): LeasedJob {
  return {
    id,
    kind: "render",
    scenario: "STUDIO",
    attempt: 1,
    leaseExpiresAt: new Date(Date.now() + 600_000).toISOString(),
    modelImageUrl: "https://r2.test/model?sig=1",
    garmentImageUrls: ["https://r2.test/garment?sig=2"],
    output: { url: "https://r2.test/out?sig=3", method: "PUT", contentType: "image/jpeg" },
  };
}

type Call = { method: string; url: string; body?: unknown; auth?: string | null };

/** A fake API and R2: answers the agent routes and signed URLs, and records every call. */
function fakeFetch(options: { leases: LeasedJob[][]; uploadStatus?: number }) {
  const calls: Call[] = [];
  const uploads: Uint8Array[] = [];
  const leases = [...options.leases];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body, auth: headers.get("authorization") });
    if (url === `${API}/agent/heartbeat`) return Response.json({ ok: true });
    if (url === `${API}/agent/renders/lease`) return Response.json({ jobs: leases.shift() ?? [] });
    if (url.startsWith(`${API}/agent/renders/`)) return Response.json({ status: "DONE" });
    if (url.startsWith("https://r2.test/out")) {
      uploads.push(new Uint8Array(init!.body as Buffer));
      return new Response(null, { status: options.uploadStatus ?? 200 });
    }
    if (url.startsWith("https://r2.test/")) return new Response(MODEL_BYTES);
    return new Response("not found", { status: 404 });
  });
  return { impl: impl as unknown as typeof fetch, calls, uploads };
}

function api(fetchImpl: typeof fetch) {
  return createApiClient({ apiUrl: API, token: "secret-token", agentId: "mac-1", fetch: fetchImpl });
}

/** A clock the loop's sleep moves forward; the loop stops after `stopAfter` sleeps. */
function fakeClock(start: Date, stopAfter: number) {
  let t = start.getTime();
  const controller = new AbortController();
  const sleeps: number[] = [];
  return {
    now: () => new Date(t),
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
      if (sleeps.length >= stopAfter) controller.abort();
    },
    signal: controller.signal,
    sleeps,
  };
}

function loopDeps(fetchImpl: typeof fetch, engine: RenderEngine, clock: ReturnType<typeof fakeClock>, window = "always") {
  return {
    api: api(fetchImpl),
    engine,
    workDir: mkdtempSync(join(tmpdir(), "agent-test-")),
    window: parseWindow(window),
    timeZone: "Asia/Kolkata",
    version: "test",
    pollMs: 30_000,
    heartbeatMs: 60_000,
    maxJobs: 1,
    log: () => undefined,
    now: clock.now,
    sleep: clock.sleep,
    signal: clock.signal,
  };
}

describe("the agent loop", () => {
  it("leases a job, renders it, uploads with the signed PUT, completes it, and leaves nothing behind", async () => {
    const fake = fakeFetch({ leases: [[job()]] });
    const seen: string[] = [];
    const dryRun = createDryRunEngine();
    const engine: RenderEngine = {
      configured: true,
      async editTryOn(input) {
        seen.push(input.modelImagePath, ...input.garmentImagePaths, input.outputPath);
        await dryRun.editTryOn(input);
      },
    };
    const clock = fakeClock(new Date("2026-11-04T12:00:00Z"), 3);
    const deps = loopDeps(fake.impl, engine, clock);
    await runAgentLoop(deps);

    const paths = fake.calls.map((c) => `${c.method} ${c.url.replace(/\?.*/, "")}`);
    expect(paths.slice(0, 6)).toEqual([
      `POST ${API}/agent/heartbeat`,
      `POST ${API}/agent/renders/lease`,
      "GET https://r2.test/model",
      "GET https://r2.test/garment",
      "PUT https://r2.test/out",
      `POST ${API}/agent/renders/11111111-1111-4111-8111-111111111111/complete`,
    ]);
    // The dry-run engine mirrors the model photo: a JPEG of the same size went up, not a copy.
    expect(sniffFormat(fake.uploads[0]!)).toBe("jpeg");
    expect(fake.uploads[0]).not.toEqual(MODEL_BYTES);
    expect(decodeImage(fake.uploads[0]!, "jpeg")).toMatchObject({ width: 640, height: 960 });
    // The agent's token on its own calls only, never on the signed R2 URLs.
    for (const call of fake.calls) {
      expect(call.auth).toBe(call.url.startsWith(API) ? "Bearer secret-token" : null);
    }
    expect(fake.calls.find((c) => c.url.endsWith("/lease"))!.body).toEqual({ max: 1, agentId: "mac-1" });
    // Random file names, all deleted with the job's folder.
    expect(new Set(seen.map((p) => p.split("/").pop())).size).toBe(seen.length);
    for (const path of seen) expect(existsSync(path)).toBe(false);
    expect(readdirSync(deps.workDir)).toEqual([]);
  });

  it("polls every 30 s while idle and sends a heartbeat every 60 s", async () => {
    const fake = fakeFetch({ leases: [] });
    const clock = fakeClock(new Date("2026-11-04T12:00:00Z"), 4);
    await runAgentLoop(loopDeps(fake.impl, createDryRunEngine(), clock));
    expect(clock.sleeps).toEqual([30_000, 30_000, 30_000, 30_000]);
    expect(fake.calls.filter((c) => c.url.endsWith("/lease"))).toHaveLength(4);
    expect(fake.calls.filter((c) => c.url.endsWith("/heartbeat"))).toHaveLength(2);
  });

  it("sleeps outside its window and leases nothing", async () => {
    const fake = fakeFetch({ leases: [[job()]] });
    // 12:00 IST, window 23:00-06:30.
    const clock = fakeClock(new Date("2026-11-04T06:30:00Z"), 2);
    await runAgentLoop(loopDeps(fake.impl, createDryRunEngine(), clock, "23:00-06:30"));
    expect(fake.calls).toEqual([]);
    expect(clock.sleeps[0]).toBe(5 * 60_000);
  });

  it("reports an engine failure as retryable, and a rejected render as not, and still cleans up", async () => {
    for (const [error, retryable] of [
      [new Error("mediagen timed out"), true],
      [new RenderRejectedError("unreadable garment photo"), false],
    ] as const) {
      const fake = fakeFetch({ leases: [] });
      const workDir = mkdtempSync(join(tmpdir(), "agent-test-"));
      const engine: RenderEngine = {
        configured: true,
        async editTryOn() {
          throw error;
        },
      };
      const outcome = await runJob(job(), { api: api(fake.impl), engine, workDir, log: () => undefined });
      expect(outcome).toBe("failed");
      const fail = fake.calls.find((c) => c.url.endsWith("/fail"))!;
      expect(fail.body).toMatchObject({ retryable, agentId: "mac-1" });
      expect(fake.calls.some((c) => c.url.endsWith("/complete"))).toBe(false);
      expect(readdirSync(workDir)).toEqual([]);
    }
  });

  it("a render that fails a quality check is reported retryable as quality:<check> and never uploaded", async () => {
    const outputs: [string, Uint8Array | "copy"][] = [
      ["format", new TextEncoder().encode("not an image")],
      ["dimensions", toJpeg(photo(400, 300, [180, 30, 40]))],
      ["blank", toJpeg(flat(640, 960, [0, 0, 0]))],
      ["unchanged", "copy"],
    ];
    for (const [check, bytes] of outputs) {
      const fake = fakeFetch({ leases: [] });
      const workDir = mkdtempSync(join(tmpdir(), "agent-test-"));
      const engine: RenderEngine = {
        configured: true,
        async editTryOn({ modelImagePath, outputPath }) {
          await writeFile(outputPath, bytes === "copy" ? await readFile(modelImagePath) : bytes);
        },
      };
      const outcome = await runJob(job(), { api: api(fake.impl), engine, workDir, log: () => undefined });
      expect(outcome).toBe("failed");
      const fail = fake.calls.find((c) => c.url.endsWith("/fail"))!;
      expect(fail.body).toMatchObject({ retryable: true, agentId: "mac-1" });
      expect((fail.body as { reason: string }).reason).toMatch(new RegExp(`^quality:${check}`));
      expect(fake.calls.some((c) => c.method === "PUT")).toBe(false);
      expect(fake.uploads).toEqual([]);
      expect(fake.calls.some((c) => c.url.endsWith("/complete"))).toBe(false);
      expect(readdirSync(workDir)).toEqual([]);
    }
    expect(isRetryable(new QualityCheckError("blank", "flat"))).toBe(true);
  });

  it("a failed upload is retryable and the job is not completed", async () => {
    const fake = fakeFetch({ leases: [], uploadStatus: 503 });
    const workDir = mkdtempSync(join(tmpdir(), "agent-test-"));
    await runJob(job(), { api: api(fake.impl), engine: createDryRunEngine(), workDir, log: () => undefined });
    expect(fake.calls.find((c) => c.url.endsWith("/fail"))!.body).toMatchObject({ retryable: true });
    expect(fake.calls.some((c) => c.url.endsWith("/complete"))).toBe(false);
  });

  it("refuses to lease with the unconfigured mediagen stub", async () => {
    const fake = fakeFetch({ leases: [[job()]] });
    const clock = fakeClock(new Date(), 1);
    await expect(runAgentLoop(loopDeps(fake.impl, createMediagenEngine("http://127.0.0.1:8199"), clock))).rejects.toThrow(
      /not configured/,
    );
    expect(fake.calls).toEqual([]);
  });
});

describe("mediagen adapter", () => {
  it("the stub throws a clear MediagenNotConfiguredError", async () => {
    const engine = createMediagenEngine("http://127.0.0.1:8199");
    expect(engine.configured).toBe(false);
    const attempt = engine.editTryOn({ modelImagePath: "a", garmentImagePaths: ["b"], scenario: "STUDIO", outputPath: "c" });
    await expect(attempt).rejects.toBeInstanceOf(MediagenNotConfiguredError);
    await expect(attempt).rejects.toThrow(/endpoint at http:\/\/127\.0\.0\.1:8199/);
    expect(isRetryable(new MediagenNotConfiguredError("x"))).toBe(false);
  });

  it("has a prompt for each of the six scenes and the plain try-on, each preserving the person", () => {
    expect(Object.keys(SCENARIO_PROMPTS).sort()).toEqual(
      ["CANDID", "EDITORIAL_DARK", "GOLDEN_HOUR", "NIGHT", "STREET", "STUDIO", "TRYON"],
    );
    for (const prompt of Object.values(SCENARIO_PROMPTS)) {
      expect(prompt).toMatch(/face/);
      expect(prompt).toMatch(/hair/);
      expect(prompt).toMatch(/pose/);
      expect(prompt).toMatch(/garment/);
    }
    expect(promptFor(null)).toBe(SCENARIO_PROMPTS.TRYON);
  });
});

describe("config", () => {
  it("reads the token from the Keychain when the env var is unset", () => {
    const readKeychain = vi.fn(() => "from-keychain");
    const config = loadConfig({ WORN_API_URL: API }, { argv: [], readKeychain });
    expect(readKeychain).toHaveBeenCalledWith("worn-render-agent");
    expect(config).toMatchObject({
      token: "from-keychain",
      mediagenUrl: "http://127.0.0.1:8199",
      window: { kind: "always" },
      timeZone: "Asia/Kolkata",
      dryRun: false,
    });
  });

  it("prefers the env token, honours --dry-run, and refuses plain http to a remote API", () => {
    const readKeychain = vi.fn(() => "unused");
    expect(
      loadConfig({ WORN_API_URL: API, RENDER_AGENT_TOKEN: "env" }, { argv: ["--dry-run"], readKeychain }),
    ).toMatchObject({ token: "env", dryRun: true });
    expect(readKeychain).not.toHaveBeenCalled();
    expect(() => loadConfig({ WORN_API_URL: "http://api.worn.test", RENDER_AGENT_TOKEN: "x" }, { argv: [] })).toThrow(/https/);
    expect(() => loadConfig({ WORN_API_URL: API }, { argv: [], readKeychain: () => null })).toThrow(/Keychain/);
  });
});

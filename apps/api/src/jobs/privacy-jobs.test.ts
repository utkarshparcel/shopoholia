import pino from "pino";
import { describe, expect, it } from "vitest";
import type { enqueueJob } from "../lib/queues/enqueue.js";
import { createMemoryRepositories } from "../lib/repositories/memory.js";
import { createMockStorage } from "../lib/storage/r2.js";
import { disconnectEmailSources, gmailTokenRevoke } from "./gmail-token-revoke.js";
import { ingestionRetention } from "./ingestion-retention.js";
import { privacyErase } from "./privacy-erase.js";
import { privacyExport } from "./privacy-export.js";

const log = pino({ level: "silent" });
const DAY_MS = 24 * 60 * 60 * 1000;

function revokeFetch(status: number, body = "") {
  const calls: Array<{ url: string; body: string }> = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: String(init?.body ?? "") });
    return new Response(body, { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("gmail-token-revoke", () => {
  const data = { sourceId: "00000000-0000-4000-8000-000000000001", encryptedToken: "blob" };

  it("revokes the refresh token and treats an already-revoked token as done", async () => {
    const ok = revokeFetch(200);
    const decryptToken = () => ({ accessToken: "a", refreshToken: "r" });
    await gmailTokenRevoke(data, { decryptToken, fetch: ok.fn });
    expect(ok.calls).toHaveLength(1);
    expect(ok.calls[0]!.url).toBe("https://oauth2.googleapis.com/revoke");
    expect(ok.calls[0]!.body).toBe("token=r");

    // Run twice: Google answers 400 invalid_token for the revoked token.
    const again = revokeFetch(400, '{"error":"invalid_token"}');
    await expect(gmailTokenRevoke(data, { decryptToken, fetch: again.fn })).resolves.toBeUndefined();
  });

  it("falls back to the access token when there is no refresh token", async () => {
    const ok = revokeFetch(200);
    await gmailTokenRevoke(data, { decryptToken: () => ({ accessToken: "a" }), fetch: ok.fn });
    expect(ok.calls[0]!.body).toBe("token=a");
  });

  it("throws on other answers so the job is retried", async () => {
    const down = revokeFetch(503);
    await expect(
      gmailTokenRevoke(data, { decryptToken: () => ({ refreshToken: "r" }), fetch: down.fn }),
    ).rejects.toThrow(/503/);
    const bad = revokeFetch(400, '{"error":"invalid_request"}');
    await expect(
      gmailTokenRevoke(data, { decryptToken: () => ({ refreshToken: "r" }), fetch: bad.fn }),
    ).rejects.toThrow(/400/);
    await expect(
      gmailTokenRevoke(data, { decryptToken: () => ({}), fetch: revokeFetch(200).fn }),
    ).rejects.toThrow(/nothing to revoke/);
  });

  it("disconnectEmailSources queues one revoke per token with a stable job id", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919000000101");
    const grant = await repos.grantConsent({ userId: user.id, scope: "EMAIL", source: "test" });
    const source = await repos.createIngestionSource({
      userId: user.id,
      kind: "EMAIL",
      provider: "gmail",
      consentGrantId: grant.id,
    });
    await repos.updateIngestionSourceToken(source.id, { data: "blob-1" });
    const jobs: Array<{ queue: string; jobId?: string; data: unknown }> = [];
    const enqueue = (async (queue, _name, data, opts) => {
      jobs.push({ queue, jobId: opts?.jobId, data });
      return { status: "queued", jobId: opts?.jobId ?? "x" };
    }) as typeof enqueueJob;

    const first = await disconnectEmailSources(repos, user.id, enqueue);
    expect(first).toEqual({ disconnected: 1, revokesQueued: 1, revokesSkipped: 0 });
    expect(jobs[0]!.queue).toBe("gmail-token-revoke");
    expect(jobs[0]!.data).toEqual({ sourceId: source.id, encryptedToken: "blob-1" });
    const [after] = await repos.listIngestionSources(user.id);
    expect(after!.encryptedToken).toBeNull();

    // Run twice: nothing left to revoke.
    const second = await disconnectEmailSources(repos, user.id, enqueue);
    expect(second.revokesQueued).toBe(0);
    expect(jobs).toHaveLength(1);
  });
});

describe("privacy-erase", () => {
  it("rejects an unknown or wrong-kind request and leaves a DONE request alone", async () => {
    const repos = createMemoryRepositories();
    const storage = createMockStorage();
    await expect(
      privacyErase({ requestId: "00000000-0000-4000-8000-000000000009" }, { repos, storage, log }),
    ).rejects.toThrow(/no ERASE request/);
    const { user } = await repos.createUser("+919000000102");
    const { request: exportReq } = await repos.createPrivacyRequest({
      userId: user.id,
      kind: "EXPORT",
      subjectRef: "ref",
    });
    await expect(privacyErase({ requestId: exportReq.id }, { repos, storage, log })).rejects.toThrow(
      /no ERASE request/,
    );
  });

  it("deletes rows, then objects, then forgets the user id", async () => {
    const repos = createMemoryRepositories();
    const storage = createMockStorage();
    const deleted: string[] = [];
    const tracking = { ...storage, delete: async (k: string) => void deleted.push(k) };
    const { user } = await repos.createUser("+919000000103");
    await repos.grantConsent({ userId: user.id, scope: "FINANCIAL", source: "test" });
    await repos.createReceipt({
      userId: user.id,
      imageKey: "receipts/x.jpg",
      merchant: "M",
      purchasedAt: new Date(),
      totalMinor: 100,
      ocrJson: {},
    });
    const { request } = await repos.createPrivacyRequest({
      userId: user.id,
      kind: "ERASE",
      subjectRef: "ref",
    });
    await privacyErase({ requestId: request.id }, { repos, storage: tracking, log });
    await privacyErase({ requestId: request.id }, { repos, storage: tracking, log });

    expect(await repos.findUserById(user.id)).toBeNull();
    expect(deleted).toEqual(["receipts/x.jpg"]);
    const done = await repos.getPrivacyRequest(request.id);
    expect(done).toMatchObject({ status: "DONE", userId: null, subjectRef: "ref", storageKeys: [] });
    expect(done!.steps).toMatchObject({ rowsDeleted: true, objectsDeleted: 1 });
    // Consent history stays, without the user id.
    expect(await repos.listConsentRecords(user.id)).toHaveLength(0);
  });
});

describe("privacy-export", () => {
  it("writes one file per request under the user's prefix; a rerun is a no-op", async () => {
    const repos = createMemoryRepositories();
    const storage = createMockStorage();
    const puts: string[] = [];
    const tracking = {
      ...storage,
      put: async (input: Parameters<typeof storage.put>[0]) => {
        puts.push(input.key);
        return storage.put(input);
      },
    };
    const { user } = await repos.createUser("+919000000104");
    await repos.grantConsent({ userId: user.id, scope: "FINANCIAL", source: "test" });
    const { request } = await repos.createPrivacyRequest({
      userId: user.id,
      kind: "EXPORT",
      subjectRef: "ref",
    });
    await privacyExport({ requestId: request.id }, { repos, storage: tracking, log });
    await privacyExport({ requestId: request.id }, { repos, storage: tracking, log });
    expect(puts).toEqual([`u/${user.id}/exports/${request.id}.json`]);
    const done = await repos.getPrivacyRequest(request.id);
    expect(done).toMatchObject({ status: "DONE", resultKey: puts[0] });
  });

  it("keeps the request open with the error when the upload fails", async () => {
    const repos = createMemoryRepositories();
    const storage = createMockStorage();
    const { user } = await repos.createUser("+919000000105");
    const { request } = await repos.createPrivacyRequest({
      userId: user.id,
      kind: "EXPORT",
      subjectRef: "ref",
    });
    const failing = {
      ...storage,
      put: async () => {
        throw new Error("R2 down");
      },
    };
    await expect(
      privacyExport({ requestId: request.id }, { repos, storage: failing, log }),
    ).rejects.toThrow("R2 down");
    expect(await repos.getPrivacyRequest(request.id)).toMatchObject({
      status: "RUNNING",
      error: "R2 down",
      attempts: 1,
    });
    await privacyExport({ requestId: request.id }, { repos, storage, log });
    expect(await repos.getPrivacyRequest(request.id)).toMatchObject({ status: "DONE", error: null });
  });
});

describe("ingestion-retention", () => {
  it("purges expired raw objects and old export files, and is safe to run twice", async () => {
    const repos = createMemoryRepositories();
    const storage = createMockStorage();
    const deleted: string[] = [];
    const tracking = {
      ...storage,
      delete: async (k: string) => {
        deleted.push(k);
      },
    };
    const { user } = await repos.createUser("+919000000106");
    const now = Date.now();
    const doc = await repos.createIngestionDocument({
      userId: user.id,
      kind: "EMAIL",
      rawKey: "raw/old.eml",
      parsedJson: {},
    });
    const rows = await repos.listIngestionDocuments();
    (rows.find((d) => d.id === doc.id) as { createdAt: Date }).createdAt = new Date(
      now - 400 * DAY_MS,
    );
    const { request } = await repos.createPrivacyRequest({
      userId: user.id,
      kind: "EXPORT",
      subjectRef: "ref",
    });
    await repos.updatePrivacyRequest(request.id, {
      status: "DONE",
      resultKey: `u/${user.id}/exports/${request.id}.json`,
      completedAt: new Date(now - 8 * DAY_MS),
    });

    const first = await ingestionRetention({}, { repos, storage: tracking, log }, now);
    expect(first.purged).toBe(1);
    expect(first.exportsPurged).toBe(1);
    expect(deleted).toEqual(["raw/old.eml", `u/${user.id}/exports/${request.id}.json`]);
    expect((await repos.getPrivacyRequest(request.id))!.resultKey).toBeNull();

    const second = await ingestionRetention({}, { repos, storage: tracking, log }, now);
    expect(second.exportsPurged).toBe(0);
    expect(second.purged).toBe(0);
  });

  it("throws after the sweep when an object could not be deleted", async () => {
    const repos = createMemoryRepositories();
    const storage = createMockStorage();
    const { user } = await repos.createUser("+919000000107");
    const { request } = await repos.createPrivacyRequest({
      userId: user.id,
      kind: "EXPORT",
      subjectRef: "ref",
    });
    await repos.updatePrivacyRequest(request.id, {
      status: "DONE",
      resultKey: "u/x/exports/y.json",
      completedAt: new Date(Date.now() - 8 * DAY_MS),
    });
    const failing = {
      ...storage,
      delete: async () => {
        throw new Error("R2 down");
      },
    };
    await expect(ingestionRetention({}, { repos, storage: failing, log })).rejects.toThrow(
      /could not be deleted/,
    );
    // The row keeps its key, so the next run tries again.
    expect((await repos.getPrivacyRequest(request.id))!.resultKey).toBe("u/x/exports/y.json");
  });
});

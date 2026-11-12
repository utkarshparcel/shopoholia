import { describe, expect, it } from "vitest";
import {
  buildParserTrainingFixture,
  listParserFixtureExportJobs,
  listParserTrainingFixtures,
  parserFeedbackAnalyticsPayload,
  stripRawBodyFields,
} from "./parser-training.js";
import { createMemoryRepositories } from "./repositories/memory.js";

describe("U041 parser-training", () => {
  it("strips raw body fields from fixture payloads", () => {
    const safe = stripRawBodyFields({
      merchant: "Myntra",
      totalMinor: 99900,
      body: "SECRET RAW EMAIL",
      html: "<b>x</b>",
      subject: "Order",
    });
    expect(safe.body).toBeUndefined();
    expect(safe.html).toBeUndefined();
    expect(safe.merchant).toBe("Myntra");
    expect(safe.subject).toBe("Order");
  });

  it("stores the fixture stub + queues export without raw body in analytics", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919800000341");
    const doc = await repos.createIngestionDocument({ userId: user.id, kind: "EMAIL", rawKey: "", parsedJson: {} });
    const stub = await buildParserTrainingFixture(repos, {
      userId: user.id,
      documentId: doc.id,
      kind: "EMAIL",
      beforeParsed: {
        merchant: "Unknown Merchant",
        totalMinor: 100,
        body: "raw should never leak",
      },
      afterParsed: {
        merchant: "Myntra",
        totalMinor: 19900,
        currency: "INR",
        body: "still raw",
      },
      correctedFields: ["merchant", "totalMinor"],
    });

    expect(stub.merchantHint).toBe("Myntra");
    expect(stub.exportQueued).toBe(true);
    expect(stub.before.merchant).toBe("Unknown Merchant");
    expect(stub.after.totalMinor).toBe(19900);
    expect(JSON.stringify(stub)).not.toMatch(/raw should never leak|still raw/);

    const analytics = parserFeedbackAnalyticsPayload(stub);
    expect(analytics.merchantHint).toBe("Myntra");
    expect(analytics).not.toHaveProperty("body");
    expect(await listParserTrainingFixtures(repos)).toEqual([stub]);
    expect((await listParserFixtureExportJobs(repos))[0]).toMatchObject({ fixtureId: stub.id, status: "QUEUED" });
    // Stored with the user, so the vault export and erasure reach it.
    const stored = await repos.listParserTrainingFixtures();
    expect(stored).toEqual([expect.objectContaining({ id: stub.id, userId: user.id, documentId: doc.id })]);
    expect(JSON.stringify(stored)).not.toMatch(/raw should never leak|still raw/);
  });

  it("a fixture without export is stored as SKIPPED and is not an export job", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919800000342");
    const doc = await repos.createIngestionDocument({ userId: user.id, kind: "SMS", rawKey: "", parsedJson: {} });
    const stub = await buildParserTrainingFixture(repos, {
      userId: user.id,
      documentId: doc.id,
      kind: "SMS",
      beforeParsed: null,
      afterParsed: { merchant: "Ajio" },
      correctedFields: ["merchant"],
      enqueueExport: false,
    });
    expect(stub.exportQueued).toBe(false);
    expect(await listParserFixtureExportJobs(repos)).toEqual([]);
  });
});

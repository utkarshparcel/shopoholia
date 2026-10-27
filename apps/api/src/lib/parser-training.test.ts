import { beforeEach, describe, expect, it } from "vitest";
import {
  buildParserTrainingFixture,
  clearParserTrainingState,
  listParserFixtureExportJobs,
  listParserTrainingFixtures,
  parserFeedbackAnalyticsPayload,
  stripRawBodyFields,
} from "./parser-training.js";

describe("U041 parser-training", () => {
  beforeEach(() => clearParserTrainingState());

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

  it("builds fixture stub + queues export without raw body in analytics", () => {
    const stub = buildParserTrainingFixture({
      documentId: "00000000-0000-4000-8000-0000000000aa",
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
    expect(listParserTrainingFixtures()).toHaveLength(1);
    expect(listParserFixtureExportJobs()[0]?.status).toBe("QUEUED");
  });
});

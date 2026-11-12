/**
 * U041 — User parse corrections → training fixture stubs + merchant hints.
 * Never include raw email/SMS/HTML bodies in fixtures or analytics payloads.
 * Fixtures are stored in `parser_training_fixtures` (they go with the user on erasure); a
 * fixture's export job is its `exportStatus` (QUEUED until the exporter picks it up).
 */

import { randomUUID } from "node:crypto";
import type { ParserTrainingFixtureRecord, Repositories } from "./repositories/types.js";

export type ParserTrainingFixtureStub = {
  id: string;
  documentId: string;
  kind: string;
  merchantHint: string | null;
  fields: string[];
  /** Structured before/after — amounts & merchant only; no raw body. */
  before: {
    merchant: string | null;
    totalMinor: number | null;
    currency: string | null;
  };
  after: {
    merchant: string | null;
    totalMinor: number | null;
    currency: string | null;
  };
  createdAt: string;
  exportQueued: boolean;
};

export type ParserFixtureExportJob = {
  id: string;
  fixtureId: string;
  documentId: string;
  merchantHint: string | null;
  status: "QUEUED" | "EXPORTED" | "SKIPPED";
  createdAt: string;
};

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asInt(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
}

/** Strip any accidental raw-body keys from a parsedJson-like object. */
export function stripRawBodyFields(
  parsed: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!parsed) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) {
    const lower = k.toLowerCase();
    if (
      lower === "body" ||
      lower === "html" ||
      lower === "raw" ||
      lower === "rawbody" ||
      lower === "text" ||
      lower === "payload"
    ) {
      continue;
    }
    out[k] = v;
  }
  return out;
}

export async function buildParserTrainingFixture(
  repos: Pick<Repositories, "insertParserTrainingFixture">,
  input: {
    userId: string;
    documentId: string;
    kind: string;
    beforeParsed: Record<string, unknown> | null | undefined;
    afterParsed: Record<string, unknown>;
    correctedFields: string[];
    enqueueExport?: boolean;
    now?: Date;
  },
): Promise<ParserTrainingFixtureStub> {
  const beforeSafe = stripRawBodyFields(input.beforeParsed);
  const afterSafe = stripRawBodyFields(input.afterParsed);
  const merchantHint =
    asString(afterSafe.merchant) ?? asString(beforeSafe.merchant);
  const row = await repos.insertParserTrainingFixture({
    id: randomUUID(),
    userId: input.userId,
    documentId: input.documentId,
    kind: input.kind,
    merchantHint,
    fields: [...input.correctedFields],
    before: {
      merchant: asString(beforeSafe.merchant),
      totalMinor: asInt(beforeSafe.totalMinor),
      currency: asString(beforeSafe.currency),
    },
    after: {
      merchant: asString(afterSafe.merchant),
      totalMinor: asInt(afterSafe.totalMinor),
      currency: asString(afterSafe.currency),
    },
    exportStatus: input.enqueueExport === false ? "SKIPPED" : "QUEUED",
    createdAt: input.now ?? new Date(),
  });
  return toStub(row);
}

function toStub(row: ParserTrainingFixtureRecord): ParserTrainingFixtureStub {
  return {
    id: row.id,
    documentId: row.documentId,
    kind: row.kind,
    merchantHint: row.merchantHint,
    fields: [...row.fields],
    before: { ...row.before },
    after: { ...row.after },
    createdAt: row.createdAt.toISOString(),
    exportQueued: row.exportStatus === "QUEUED",
  };
}

/** Fixtures newest first (ops). */
export async function listParserTrainingFixtures(
  repos: Pick<Repositories, "listParserTrainingFixtures">,
  limit = 50,
): Promise<ParserTrainingFixtureStub[]> {
  return (await repos.listParserTrainingFixtures({ limit })).map(toStub);
}

/** The fixtures waiting for export, newest first, as export jobs. */
export async function listParserFixtureExportJobs(
  repos: Pick<Repositories, "listParserTrainingFixtures">,
  limit = 50,
): Promise<ParserFixtureExportJob[]> {
  return (await repos.listParserTrainingFixtures({ limit, exportStatus: "QUEUED" })).map((row) => ({
    id: row.id,
    fixtureId: row.id,
    documentId: row.documentId,
    merchantHint: row.merchantHint,
    status: row.exportStatus,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Analytics-safe payload — never raw bodies. */
export function parserFeedbackAnalyticsPayload(stub: ParserTrainingFixtureStub): {
  documentId: string;
  kind: string;
  merchantHint: string | null;
  /** Comma-joined: analytics properties are scalars only. */
  fields: string;
  fixtureId: string;
  exportQueued: boolean;
} {
  return {
    documentId: stub.documentId,
    kind: stub.kind,
    merchantHint: stub.merchantHint,
    fields: stub.fields.join(","),
    fixtureId: stub.id,
    exportQueued: stub.exportQueued,
  };
}

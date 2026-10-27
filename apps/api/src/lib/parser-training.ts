/**
 * U041 — User parse corrections → training fixture stubs + merchant hints.
 * Never include raw email/SMS/HTML bodies in fixtures or analytics payloads.
 */

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

const fixtures: ParserTrainingFixtureStub[] = [];
const exportJobs: ParserFixtureExportJob[] = [];
const MAX = 2000;

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asInt(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `pt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

export function buildParserTrainingFixture(input: {
  documentId: string;
  kind: string;
  beforeParsed: Record<string, unknown> | null | undefined;
  afterParsed: Record<string, unknown>;
  correctedFields: string[];
  enqueueExport?: boolean;
}): ParserTrainingFixtureStub {
  const beforeSafe = stripRawBodyFields(input.beforeParsed);
  const afterSafe = stripRawBodyFields(input.afterParsed);
  const merchantHint =
    asString(afterSafe.merchant) ?? asString(beforeSafe.merchant);
  const stub: ParserTrainingFixtureStub = {
    id: randomId(),
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
    createdAt: new Date().toISOString(),
    exportQueued: false,
  };

  if (input.enqueueExport !== false) {
    const job = enqueueParserFixtureExport(stub);
    stub.exportQueued = job.status === "QUEUED";
  }

  fixtures.push(stub);
  if (fixtures.length > MAX) fixtures.shift();
  return stub;
}

export function enqueueParserFixtureExport(
  stub: Pick<ParserTrainingFixtureStub, "id" | "documentId" | "merchantHint">,
): ParserFixtureExportJob {
  const job: ParserFixtureExportJob = {
    id: randomId(),
    fixtureId: stub.id,
    documentId: stub.documentId,
    merchantHint: stub.merchantHint,
    status: "QUEUED",
    createdAt: new Date().toISOString(),
  };
  exportJobs.push(job);
  if (exportJobs.length > MAX) exportJobs.shift();
  return job;
}

export function listParserTrainingFixtures(limit = 50): ParserTrainingFixtureStub[] {
  return fixtures.slice(-limit).reverse();
}

export function listParserFixtureExportJobs(limit = 50): ParserFixtureExportJob[] {
  return exportJobs.slice(-limit).reverse();
}

export function clearParserTrainingState(): void {
  fixtures.length = 0;
  exportJobs.length = 0;
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

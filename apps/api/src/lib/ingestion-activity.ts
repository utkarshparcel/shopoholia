import type {
  IngestionDocumentRecord,
  MerchantPurchaseRecord,
} from "./repositories/types.js";

const SNIPPET_MAX = 160;
const SUBJECT_MAX = 120;

function truncate(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : null;
}

/**
 * Build a privacy-safe activity row from an ingestion document.
 * Never includes raw email/SMS body, HTML, or tokens.
 */
export function toIngestionActivityItem(
  doc: IngestionDocumentRecord,
  purchase?: MerchantPurchaseRecord | null,
): {
  id: string;
  kind: IngestionDocumentRecord["kind"];
  merchant: string | null;
  status: IngestionDocumentRecord["status"];
  matchedPurchaseId: string | null;
  subject: string | null;
  snippet: string | null;
  totalMinor: number | null;
  currency: string | null;
  createdAt: string;
} {
  const pj = doc.parsedJson ?? {};

  const merchant =
    asString(pj.merchant) ?? purchase?.merchant ?? null;

  let subject = asString(pj.subject);
  if (!subject) {
    const from = asString(pj.from);
    if (doc.kind === "SMS" && from) subject = `SMS from ${from}`;
  }

  // Prefer explicit snippet. Never surface raw email body/html as the snippet —
  // EMAIL bodies stay in storage only. SMS may use a truncated body (short by nature).
  let snippetSource = asString(pj.snippet);
  if (!snippetSource && doc.kind === "SMS") {
    snippetSource = asString(pj.body) ?? asString(pj.text);
  }

  const totalMinor =
    asInt(pj.totalMinor) ?? purchase?.totalMinor ?? null;
  const currency =
    asString(pj.currency) ?? purchase?.currency ?? null;

  return {
    id: doc.id,
    kind: doc.kind,
    merchant,
    status: doc.status,
    matchedPurchaseId: doc.matchedPurchaseId,
    subject: subject ? truncate(subject, SUBJECT_MAX) : null,
    snippet: snippetSource ? truncate(snippetSource, SNIPPET_MAX) : null,
    totalMinor,
    currency,
    createdAt: doc.createdAt.toISOString(),
  };
}

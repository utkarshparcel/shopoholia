import type { IngestionDocumentRecord, MerchantPurchaseRecord } from "./repositories/types.js";

export type IngestionMetrics = {
  totalMessages: number;
  specificHits: number;
  genericHits: number;
  misses: number;
  coverage: number;
  byStatus: Record<string, number>;
  byKind: Record<string, number>;
  byMerchant: Record<string, number>;
  costEstimate: {
    perMessageMinor: number;
    estimatedTotalMinor: number;
    currency: string;
  };
  note: string;
  // Resilience (P2)
  deadLetterCount: number;
  errorRate: number;
};

// Cost stub: ~0.5 paise per parse (OCR excluded). Real cost would be OCR +
// FASHN etc; this is a placeholder for dashboards.
const PER_MESSAGE_MINOR = 50; // 0.50 INR in minor units

export function computeIngestionMetrics(
  documents: IngestionDocumentRecord[],
  purchases: MerchantPurchaseRecord[],
): IngestionMetrics {
  const totalMessages = documents.length;

  const byStatus: Record<string, number> = {};
  const byKind: Record<string, number> = {};

  for (const d of documents) {
    byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
    byKind[d.kind] = (byKind[d.kind] ?? 0) + 1;
  }

  const specificHits = byStatus["MATCHED"] ?? 0;
  const genericHits = byStatus["PARSED"] ?? 0;
  const misses = (byStatus["UNMATCHED"] ?? 0) + (byStatus["ERROR"] ?? 0);
  const pending = byStatus["RECEIVED"] ?? 0;
  // Coverage = matched / (matched + generic + misses); pending excluded.
  const denom = specificHits + genericHits + misses;
  const coverage = denom > 0 ? specificHits / denom : 0;

  const byMerchant: Record<string, number> = {};
  for (const p of purchases) {
    byMerchant[p.merchant] = (byMerchant[p.merchant] ?? 0) + 1;
  }

  const deadLetterCount = byStatus["ERROR"] ?? 0;
  const errorRate = totalMessages > 0 ? Math.round((deadLetterCount / totalMessages) * 10000) / 10000 : 0;
  return {
    totalMessages,
    specificHits,
    genericHits,
    misses: misses + pending,
    coverage: Math.round(coverage * 10000) / 10000,
    byStatus,
    byKind,
    byMerchant,
    costEstimate: {
      perMessageMinor: PER_MESSAGE_MINOR,
      estimatedTotalMinor: totalMessages * PER_MESSAGE_MINOR,
      currency: "INR",
    },
    note: "Cost is a stub (parse only). Wire to Grafana/Metabase via GET /ingestion/metrics. OCR/FASHN costs are tracked separately. Resilience: deadLetterCount=byStatus.ERROR (ingest-dead-letter DLQ), per-source exponential backoff tracked in worker (see services/worker-ingest/src/dead-letter.ts).",
    deadLetterCount,
    errorRate,
  };
}

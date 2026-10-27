import type { OcrClient, OcrResult } from "./index.js";

export type HostedOcrConfig = {
  apiKey?: string;
  /** Preferred: OCR_PROVIDER_URL. OCR_PROVIDER_ENDPOINT kept as alias. */
  url?: string;
  endpoint?: string;
  /** `generic` (default) or `google-vision` response mapping. */
  format?: "generic" | "google-vision";
  fetchImpl?: typeof fetch;
};

/** A provider call (request and body) that takes longer than this fails. */
export const OCR_TIMEOUT_MS = 10_000;

type GenericProviderBody = {
  merchant?: string;
  totalMinor?: number;
  items?: Array<{ title: string; priceMinor: number; category?: string }>;
  confidence?: number;
  warrantyHint?: { itemIndex: number; months: number } | null;
  claimContactHint?: string | null;
  raw?: Record<string, unknown>;
  result?: unknown;
  responses?: Array<{
    fullTextAnnotation?: { text?: string };
    textAnnotations?: Array<{ description?: string }>;
  }>;
};

/**
 * Hosted OCR provider.
 *
 * NOTE(OCR-SPIKE resolved: hosted vs on-device decision)
 * Spike evaluated two options for receipt OCR (see
 * services/worker-ingest/src/spikes/ocr/README.md):
 *  - Hosted: send R2 object bytes to a cloud OCR/vision API (higher accuracy
 *    on messy scans, pay-per-page, requires network + PII egress controls).
 *  - On-device: run a local model on the client/upload worker (no egress,
 *    lower marginal cost, offline-capable, but lower accuracy and heavier
 *    compute/memory on device).
 *
 * Decision: default remains mock when `OCR_PROVIDER_URL` is unset —
 * deterministic, no external dependency. Hosted is selected automatically
 * when `OCR_PROVIDER_URL` (or `OCR_PROVIDER_ENDPOINT`) is set. Optional
 * `OCR_PROVIDER_API_KEY` is sent as Bearer when present.
 * Optional OCR_PROVIDER_FORMAT=google-vision maps Vision annotate responses;
 * default is a generic JSON contract. Confidence is always returned.
 */
export class HostedOcrClient implements OcrClient {
  constructor(private readonly config: HostedOcrConfig = {}) {}

  async recognize(imageKey: string): Promise<OcrResult> {
    const url = this.config.url ?? this.config.endpoint;
    const apiKey = this.config.apiKey;
    if (!url) {
      throw new Error(
        "HostedOcrClient: OCR_PROVIDER_URL not configured. Set OCR_PROVIDER=mock or provide OCR_PROVIDER_URL.",
      );
    }
    const fetchFn = this.config.fetchImpl ?? fetch;
    const format = this.config.format ?? "generic";

    const res = await fetchFn(url, {
      method: "POST",
      signal: AbortSignal.timeout(OCR_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(
        format === "google-vision"
          ? {
              requests: [
                {
                  image: { source: { imageUri: imageKey } },
                  features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
                },
              ],
            }
          : { imageKey },
      ),
    });
    if (!res.ok) {
      throw new Error(`HostedOcrClient request failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as GenericProviderBody;
    return normalizeHostedResponse(data, format);
  }
}

export function normalizeHostedResponse(
  data: GenericProviderBody,
  format: "generic" | "google-vision" = "generic",
): OcrResult {
  if (format === "google-vision" || Array.isArray(data.responses)) {
    const text =
      data.responses?.[0]?.fullTextAnnotation?.text ??
      data.responses?.[0]?.textAnnotations?.[0]?.description ??
      "";
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const merchant = lines[0] || data.merchant || "Unknown Merchant";
    const totalMatch = text.match(/(?:total|amount|paid)[^\d]*(\d+(?:[.,]\d{2})?)/i);
    const totalMinor = data.totalMinor ?? (totalMatch ? Math.round(Number(totalMatch[1]!.replace(",", "")) * 100) : undefined);
    const items: Array<{ title: string; priceMinor: number; category?: string }> =
      Array.isArray(data.items) && data.items.length > 0
        ? data.items
        : lines.slice(1, 4).map((title) => ({ title, priceMinor: 0 }));
    const confidence =
      typeof data.confidence === "number" ? data.confidence : text ? 0.8 : 0.5;
    return {
      merchant,
      totalMinor,
      items: items.map((i) => ({
        title: String(i.title ?? "Item"),
        priceMinor: Number(i.priceMinor ?? 0),
        category: i.category,
      })),
      confidence,
      warrantyHint: data.warrantyHint ?? null,
      claimContactHint: data.claimContactHint ?? null,
      raw: { provider: "google-vision", text, confidence, ...(data.raw ?? {}) },
    };
  }

  const items = Array.isArray(data.items) ? data.items : [];
  const confidence = typeof data.confidence === "number" ? data.confidence : 0.85;
  return {
    merchant: data.merchant,
    totalMinor: data.totalMinor,
    items: items.map((i) => ({
      title: String(i.title ?? "Item"),
      priceMinor: Number(i.priceMinor ?? 0),
      category: i.category,
    })),
    confidence,
    warrantyHint: data.warrantyHint ?? null,
    claimContactHint: data.claimContactHint ?? null,
    raw: { ...((data.raw ?? data) as Record<string, unknown>), confidence },
  };
}

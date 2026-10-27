import { MockOcrClient } from "./mock.js";
import { HostedOcrClient } from "./hosted.js";

export type OcrItem = {
  title: string;
  priceMinor: number;
  category?: string;
};

export type OcrResult = {
  merchant?: string;
  totalMinor?: number;
  items: OcrItem[];
  raw: Record<string, unknown>;
  /** Always in [0, 1]. Callers must not treat OCR as authoritative below a product threshold. */
  confidence: number;
  warrantyHint?: { itemIndex: number; months: number } | null;
  /** Support email / URL / phone when OCR detects a claim contact. */
  claimContactHint?: string | null;
  /** Indian GSTIN when detected on the receipt image. */
  gstin?: string | null;
};

/**
 * Pluggable OCR boundary. `recognize` turns a stored receipt image (by R2 key)
 * into structured line items. Implementations must be side-effect free apart
 * from reading the image bytes.
 */
export interface OcrClient {
  recognize(imageKey: string): Promise<OcrResult>;
}

/**
 * Selects the OCR provider from env.
 *
 * - Hosted when `OCR_PROVIDER_URL` (or legacy `OCR_PROVIDER_ENDPOINT`) is set.
 * - Mock otherwise (no external dependency).
 * - `OCR_PROVIDER=mock` forces mock even if a URL is present.
 * - `OCR_PROVIDER=hosted` without a URL logs a warning and falls back to mock.
 */
export function createOcrClientFromEnv(
  env: Record<string, string | undefined> = process.env,
): OcrClient {
  const explicit = env.OCR_PROVIDER;
  if (explicit === "mock") {
    return new MockOcrClient();
  }

  const url = env.OCR_PROVIDER_URL ?? env.OCR_PROVIDER_ENDPOINT;
  if (url) {
    const format =
      env.OCR_PROVIDER_FORMAT === "google-vision" ? "google-vision" : "generic";
    return new HostedOcrClient({
      apiKey: env.OCR_PROVIDER_API_KEY,
      url,
      format,
    });
  }

  if (explicit === "hosted") {
    console.warn(
      "[ocr] OCR_PROVIDER=hosted but OCR_PROVIDER_URL missing — falling back to MockOcrClient",
    );
    return new MockOcrClient();
  }

  return new MockOcrClient();
}

export { MockOcrClient } from "./mock.js";
export { HostedOcrClient } from "./hosted.js";

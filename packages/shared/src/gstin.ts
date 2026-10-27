/**
 * Indian GSTIN helpers for invoice archive search (N18).
 * Format: 15 chars — 2 digit state + 10 PAN + entity + Z + check.
 */

const GSTIN_RE =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Strip spaces/dashes and uppercase. */
export function normalizeGstin(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

export function isValidGstin(raw: string): boolean {
  return GSTIN_RE.test(normalizeGstin(raw));
}

/**
 * Pull the first GSTIN-shaped token from OCR / email text.
 * Accepts optional "GSTIN" / "GSTIN:" labels.
 */
export function extractGstin(text: string): string | null {
  const labeled = text.match(
    /GSTIN\s*[:#]?\s*([0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][1-9A-Za-z]Z[0-9A-Za-z])/i,
  );
  if (labeled?.[1]) {
    const n = normalizeGstin(labeled[1]);
    return isValidGstin(n) ? n : null;
  }
  const bare = text.match(
    /\b([0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][1-9A-Za-z]Z[0-9A-Za-z])\b/,
  );
  if (bare?.[1]) {
    const n = normalizeGstin(bare[1]);
    return isValidGstin(n) ? n : null;
  }
  return null;
}

/** Read GSTIN from a receipt row / OCR blob. */
export function readReceiptGstin(input: {
  gstin?: string | null;
  ocrJson?: Record<string, unknown> | null;
}): string | null {
  if (typeof input.gstin === "string" && input.gstin.trim()) {
    const n = normalizeGstin(input.gstin);
    return n || null;
  }
  const ocr = input.ocrJson ?? {};
  if (typeof ocr.gstin === "string" && ocr.gstin.trim()) {
    return normalizeGstin(ocr.gstin);
  }
  const rawText =
    typeof ocr.text === "string"
      ? ocr.text
      : typeof ocr.rawText === "string"
        ? ocr.rawText
        : null;
  if (rawText) return extractGstin(rawText);
  return null;
}

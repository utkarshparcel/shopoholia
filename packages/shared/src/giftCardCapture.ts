/**
 * Physical gift-card capture: derive merchant + code/last4 from a barcode
 * string and/or OCR text so the vault form can prefill before the user
 * confirms the balance.
 */

import { z } from "zod";

export const GiftCardCaptureSourceSchema = z.enum(["BARCODE", "PHOTO"]);
export type GiftCardCaptureSource = z.infer<typeof GiftCardCaptureSourceSchema>;

export type GiftCardCaptureInput = {
  barcode?: string | null;
  ocrText?: string | null;
  merchantHint?: string | null;
};

export type GiftCardCaptureParsed = {
  merchant: string | null;
  code: string | null;
  codeLast4: string | null;
};

/** Alias used by older call sites / index re-exports. */
export type ParsedGiftCardCapture = GiftCardCaptureParsed & {
  raw: string | null;
  last4: string | null;
};

const MERCHANT_HINTS: Array<{ re: RegExp; merchant: string }> = [
  { re: /\bamazon\b/i, merchant: "Amazon" },
  { re: /\bamzn\b/i, merchant: "Amazon" },
  { re: /\bmyntra\b/i, merchant: "Myntra" },
  { re: /\bflipkart\b/i, merchant: "Flipkart" },
  { re: /\bnike\b/i, merchant: "Nike" },
  { re: /\bapple\b/i, merchant: "Apple" },
  { re: /\bstarbucks\b/i, merchant: "Starbucks" },
  { re: /\btarget\b/i, merchant: "Target" },
  { re: /\bwalmart\b/i, merchant: "Walmart" },
  { re: /\bnordstrom\b/i, merchant: "Nordstrom" },
  { re: /\bcroma\b/i, merchant: "Croma" },
];

function normalizeCode(raw: string): string {
  return raw.replace(/[\s-]+/g, "").toUpperCase();
}

function last4From(code: string | null): string | null {
  if (!code || code.length < 4) return null;
  return code.slice(-4);
}

/** Pull a plausible gift-card / PIN code from free text or barcode payload. */
function extractCode(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const labeled = trimmed.match(
    /(?:^|[^A-Za-z0-9])(?:gift\s*card|card\s*(?:number|#)|code|pin)\b[:\s#-]*([A-Z0-9][A-Z0-9-]{5,31})/i,
  );
  if (labeled?.[1]) {
    const code = normalizeCode(labeled[1]);
    if (code.length >= 6 && code.length <= 32) return code;
  }

  const tokens = trimmed.match(/\b[A-Z0-9][A-Z0-9-]{5,31}\b/gi) ?? [];
  let best: string | null = null;
  for (const t of tokens) {
    const code = normalizeCode(t);
    if (code.length < 6 || code.length > 32) continue;
    if (!/\d/.test(code)) continue;
    if (/BALANCE|EXPIRES|AMOUNT|RUPEES|DOLLARS/i.test(code)) continue;
    if (!best || code.length > best.length) best = code;
  }
  return best;
}

function extractMerchant(text: string, hint?: string | null): string | null {
  if (hint && hint.trim() && hint.trim().toLowerCase() !== "unknown merchant") {
    return hint.trim();
  }
  for (const { re, merchant } of MERCHANT_HINTS) {
    if (re.test(text)) return merchant;
  }
  return null;
}

/**
 * Prefill helpers for vault "Scan / photo card".
 * Barcode wins for the code when both are present; merchant prefers OCR hint.
 */
export function parseGiftCardCapture(
  input: GiftCardCaptureInput,
): GiftCardCaptureParsed {
  const barcode = (input.barcode ?? "").trim();
  const ocrText = (input.ocrText ?? "").trim();

  // MERCHANT|CODE or MERCHANT:CODE barcode shapes
  const sep = barcode.match(/^([A-Za-z][A-Za-z0-9 .&-]{1,40})\s*[|:]\s*(.+)$/);
  if (sep) {
    const merchantLabel = sep[1]!.trim();
    const code = normalizeCode(sep[2]!);
    const fromHint = extractMerchant(merchantLabel, input.merchantHint);
    return {
      merchant: fromHint ?? merchantLabel,
      code,
      codeLast4: last4From(code),
    };
  }

  const combined = [barcode, ocrText].filter(Boolean).join("\n");

  const codeFromBarcode = barcode ? extractCode(barcode) : null;
  const codeFromOcr = ocrText ? extractCode(ocrText) : null;
  const code = codeFromBarcode ?? codeFromOcr;

  return {
    merchant: extractMerchant(combined, input.merchantHint),
    code,
    codeLast4: last4From(code),
  };
}

/** Parse a bare barcode / scanned string into capture fields. */
export function parseGiftCardBarcode(barcode: string): ParsedGiftCardCapture {
  const parsed = parseGiftCardCapture({ barcode });
  return {
    ...parsed,
    raw: barcode.trim() || null,
    last4: parsed.codeLast4,
  };
}

/**
 * Prefill from optional barcode + OCR merchant/text (photo path).
 */
export function giftCardCapturePrefill(input: {
  barcode?: string | null;
  merchantHint?: string | null;
  ocrText?: string | null;
}): ParsedGiftCardCapture {
  const parsed = parseGiftCardCapture(input);
  const raw =
    (input.barcode ?? "").trim() ||
    (input.ocrText ?? "").trim() ||
    null;
  return {
    ...parsed,
    raw,
    last4: parsed.codeLast4,
  };
}

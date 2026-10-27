import type { ParsedCreditSignal } from "./types.js";

const GIFT_CARD_RE =
  /\bgift\s*cards?\b|\be-?gifts?\b|\bdigital\s+gift\b|\bgift\s+voucher\b/i;

const STORE_CREDIT_RE =
  /\bstore\s+credits?\b|\brefund(?:ed)?\s+(?:as|to|via)\s+(?:store\s+)?credits?\b|\bcredits?\s+(?:has\s+been\s+)?(?:issued|added|credited)\b|\bwallet\s+credits?\b|\bcredited\s+to\s+your\s+(?:account|wallet|balance)\b|\brefund\s+to\s+(?:store\s+)?credits?\b|\bpurchase\s+refund(?:ed)?\s+to\s+credits?\b/i;

const LOYALTY_POINTS_RE =
  /\b(?:loyalty|reward|super)\s*points?\b|\binsider\s+points?\b|\bsupercoins?\b|\breward\s+points?\b|\bpoints?\s+balance\b|\byou\s+have\s+\d[\d,]*\s+points?\b/i;

function parseAmountToNumber(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

function detectCurrency(text: string): string {
  if (/₹/.test(text) || /\bRs\.?\b/i.test(text) || /\bINR\b/i.test(text)) {
    return "INR";
  }
  if (/\$/.test(text) || /\bUSD\b/i.test(text)) return "USD";
  return "INR";
}

/** Prefer amounts tied to gift-card / credit / loyalty phrasing; else null. */
function extractCreditAmountMinor(text: string): number | null {
  const patterns = [
    /(?:gift\s*cards?|store\s+credits?|credits?|voucher|points?|supercoins?)\s*(?:value|balance|amount|of)?\s*[:-]?\s*(?:₹|Rs\.?\s*|INR\s*|\$|USD\s*)?([\d,]+(?:\.\d{1,2})?)/gi,
    /(?:₹|Rs\.?\s*|INR\s*|\$|USD\s*)([\d,]+(?:\.\d{1,2})?)\s*(?:gift\s*cards?|store\s+credits?|credits?|voucher|points?)/gi,
    /(?:issued|refunded|credited|added)\s+(?:as\s+|to\s+)?(?:store\s+)?credits?\s*(?:of)?\s*(?:₹|Rs\.?\s*|INR\s*|\$|USD\s*)?([\d,]+(?:\.\d{1,2})?)/gi,
    /(?:balance|value)\s*(?:of|:)?\s*(?:₹|Rs\.?\s*|INR\s*|\$|USD\s*)?([\d,]+(?:\.\d{1,2})?)/gi,
    /(?:you\s+have|balance[:\s]+)\s*([\d,]+)\s*(?:points?|supercoins?)/gi,
    /(?:account|wallet)\s+(?:₹|Rs\.?\s*|INR\s*|\$|USD\s*)([\d,]+(?:\.\d{1,2})?)/gi,
  ];
  const candidates: number[] = [];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const raw = m[1];
      if (!raw) continue;
      const n = parseAmountToNumber(raw);
      if (n !== null && n > 0) candidates.push(n);
    }
  }
  if (candidates.length === 0) return null;
  return Math.round(Math.max(...candidates) * 100);
}

function extractExpiresAt(text: string): string | null {
  const m = text.match(
    /(?:expir(?:es|y|ing)|valid\s+(?:till|until|through|to))\s*[:-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
  );
  if (!m?.[1]) return null;
  const raw = m[1];
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const parts = raw.split(/[/-]/);
  if (parts.length !== 3) return null;
  const [a, b, c] = parts.map(Number);
  if (!a || !b || !c) return null;
  let year = c;
  if (year < 100) year += 2000;
  const day = a > 12 ? a : b > 12 ? b : a;
  const month = a > 12 ? b : a;
  const d = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Detect gift-card / store-credit / loyalty-points signals in an email/SMS body.
 * Returns null when the message is a normal purchase.
 * Balances are best-effort parses — not live wallet sync.
 */
export function detectCreditSignal(
  subject: string,
  text: string,
  fallbackTotalMinor = 0,
  fallbackCurrency?: string,
): ParsedCreditSignal | null {
  const hay = `${subject}\n${text}`;
  const isGift = GIFT_CARD_RE.test(hay);
  const isStore = STORE_CREDIT_RE.test(hay);
  const isLoyalty = LOYALTY_POINTS_RE.test(hay);
  if (!isGift && !isStore && !isLoyalty) return null;

  const amount =
    extractCreditAmountMinor(hay) ??
    (fallbackTotalMinor > 0 ? fallbackTotalMinor : null);
  if (amount === null || amount <= 0) return null;

  let kind: ParsedCreditSignal["kind"];
  if (isLoyalty && !isGift && !isStore) kind = "LOYALTY_POINTS";
  else if (isStore) kind = "STORE_CREDIT";
  else kind = "GIFT_CARD";

  return {
    kind,
    balanceMinor: amount,
    currency: fallbackCurrency ?? detectCurrency(hay),
    expiresAt: extractExpiresAt(hay),
  };
}

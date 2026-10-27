import { detectCreditSignal } from "./credit-detect.js";
import { detectDeliveryFromText } from "@worn/shared";
import type { MerchantParser, ParsedPurchase, RawEmailMessage } from "./types.js";

const RECEIPT_HINTS = [
  /order/i,
  /invoice/i,
  /receipt/i,
  /your purchase/i,
  /payment/i,
  /total/i,
];

const GRAND_TOTAL_PHRASE_RE =
  /(?:grand\s+total|order\s+total|total\s+amount)\b/i;

function detectCurrency(text: string): string {
  // INR cues: ₹, Rs./Rs, INR, UPI, "Paid via UPI"
  if (/₹/.test(text)) return "INR";
  if (/\bRs\.?\b/i.test(text)) return "INR";
  if (/\bINR\b/i.test(text)) return "INR";
  if (/paid\s+via\s+upi/i.test(text)) return "INR";
  if (/\bUPI\b/i.test(text)) return "INR";
  if (/\$/.test(text)) return "USD";
  if (/\bUSD\b/i.test(text)) return "USD";
  return "INR";
}

function parseAmountToNumber(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

function extractNumbers(text: string): number[] {
  // Lakh-aware: matches 12,34,567.00 as well as 1,299.00 and 1299.00
  // Strip order refs (e.g. "#ABC12345") so their numeric suffix isn't mistaken for an amount
  const sanitized = text.replace(/(?:order(?:\s*id)?|order\s*#|#)\s*[:#]?\s*[A-Z0-9][A-Z0-9-]*/gi, " ");
  const candidates = sanitized.match(/\b\d[\d,]*\.\d{1,2}\b|\b\d[\d,]*\b/g) ?? [];
  const out: number[] = [];
  for (const c of candidates) {
    const n = parseAmountToNumber(c);
    if (n !== null) out.push(n);
  }
  return out;
}

export function parseAmountMinor(text: string, _currency: string): number {
  // 1) Prefer numbers directly following a grand-total phrase (word-boundary, not Subtotal)
  const phraseCandidates: number[] = [];
  const phraseRe =
    /(?:grand\s+total|order\s+total|total\s+amount)\b[^\d]*?(?:₹|Rs\.?\s*|INR\s*|\$|USD\s*)?([\d,]+(?:\.\d{1,2})?)/gi;
  for (const m of text.matchAll(phraseRe)) {
    const raw = m[1];
    if (!raw) continue;
    const n = parseAmountToNumber(raw);
    if (n !== null) phraseCandidates.push(n);
  }
  if (phraseCandidates.length > 0) {
    return Math.round(Math.max(...phraseCandidates) * 100);
  }

  // 2) Fallback: exclude lines that are pure Subtotal (not grand) to avoid picking it as max
  const lines = text.split(/\r?\n/);
  const filtered: number[] = [];
  const unfiltered: number[] = [];
  for (const line of lines) {
    const nums = extractNumbers(line);
    for (const n of nums) unfiltered.push(n);
    if (/\bsub\s*total\b/i.test(line) && !GRAND_TOTAL_PHRASE_RE.test(line)) {
      continue;
    }
    for (const n of nums) filtered.push(n);
  }
  const pool = filtered.length > 0 ? filtered : unfiltered;
  let max = 0;
  for (const n of pool) if (n > max) max = n;
  return Math.round(max * 100);
}

export function detectCurrencyExport(text: string): string {
  return detectCurrency(text);
}

function parseItems(text: string, totalMinor: number, currency: string): ParsedPurchase["items"] {
  const items: ParsedPurchase["items"] = [];
  const lines = text.split(/\r?\n/);
  const totalKeywords = /(?:grand\s+total|order\s+total|total\s+amount|\bsub\s*total\b|\binvoice\s+total\b|\btotal\b|amount\s+paid|order\s+id|invoice)/i;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    // Skip pure header/total lines — but allow lines that look like item with price
    // If line contains total keyword and not item cues, skip
    if (totalKeywords.test(line)) {
      // still parse if it also contains item-like "x" or "Qty"
      if (!/(?:\d+\s*[xX×]|\bQty\b|\bQuantity\b|•|-)/.test(line)) {
        // Check if line is primarily a total line: contains total keyword + price but no item title before price
        // We skip lines where total keyword appears before price; they are not items
        if (line.length < 80 && /(?:total|amount)/i.test(line)) continue;
      }
    }
    if (!/(?:₹|\$|Rs\.?|INR|USD)/i.test(line) && !/\d+\.\d{2}/.test(line)) continue;

    // Try pattern: "1 x Item Title - ₹500" or "2 X Item - Rs. 1,200.00"
    let m = line.match(/(\d+)\s*[xX×]\s*(.+?)\s*[-–—]\s*(?:₹|Rs\.?\s*|INR\s*|\$|USD\s*)?([\d,]+\.\d{1,2})/);
    if (m) {
      const qty = Number(m[1]);
      const title = m[2]!.trim().replace(/^[•*-]\s*/, "").trim();
      const price = parseAmountToNumber(m[3]!);
      if (title && price !== null && Number.isFinite(qty) && qty > 0) {
        items.push({ title: title.slice(0, 120), priceMinor: Math.round(price * 100), qty });
        continue;
      }
    }
    // Pattern: "Item Title Qty: 1 Price: ₹500" or "Qty: 2 Price: ₹400"
    m = line.match(/(.+?)\s*Qty\s*[:-]?\s*(\d+)\s*.*?Price\s*[:-]?\s*(?:₹|Rs\.?\s*|INR\s*|\$|USD\s*)?([\d,]+\.\d{1,2})/i);
    if (m) {
      const title = m[1]!.trim().replace(/^[•*-]\s*/, "").trim() || "Item";
      const qty = Number(m[2]);
      const price = parseAmountToNumber(m[3]!);
      if (price !== null && Number.isFinite(qty) && qty > 0) {
        items.push({ title: title.slice(0, 120), priceMinor: Math.round(price * 100), qty });
        continue;
      }
    }
    // Bullet / generic: "• Item Name - ₹500" or "- Item Name ₹500"
    m = line.match(/^[•*-]\s*(.+?)\s*[-–—]?\s*(?:₹|Rs\.?\s*|INR\s*|\$|USD\s*)?([\d,]+\.\d{1,2})\s*$/);
    if (m) {
      const title = m[1]!.trim();
      const price = parseAmountToNumber(m[2]!);
      if (title && price !== null && !totalKeywords.test(title)) {
        items.push({ title: title.slice(0, 120), priceMinor: Math.round(price * 100), qty: 1 });
        continue;
      }
    }
    // Fallback line with price: try to extract title as text before price
    const numeric = line.match(/([\d,]+\.\d{1,2})/);
    if (numeric) {
      const p = parseAmountToNumber(numeric[1]!);
      if (p !== null) {
        const idx = line.lastIndexOf(numeric[1]!);
        let title = line.slice(0, idx).trim();
        title = title.replace(/^[•*\d\sxX×-]+/, "").replace(/[:–—-]\s*$/, "").trim();
        title = title.replace(/^(?:₹|Rs\.?|INR|\$|USD)\s*/i, "").trim();
        // strip trailing currency symbols
        title = title.replace(/[₹$]\s*$/, "").trim();
        if (title.length >= 3 && !totalKeywords.test(title) && title.length < 120) {
          if (!/order\s*(?:id|#)/i.test(title)) {
            // Heuristic: skip lines that are too short numeric or date
            if (!/^\d{1,2}\s+\w+\s+\d{4}$/.test(title)) {
              items.push({ title: title.slice(0, 120), priceMinor: Math.round(p * 100), qty: 1 });
              continue;
            }
          }
        }
      }
    }
  }

  if (items.length === 0 && totalMinor > 0) {
    // Synthetic fallback: ensure at least one item so merchant_purchase_items is populated
    // Derive title from first meaningful line or currency hint
    const meaningful = lines.map((l) => l.trim()).find((l) => l.length > 5 && !totalKeywords.test(l) && !/order\s*id/i.test(l));
    const title = meaningful ? meaningful.slice(0, 80) : currency === "USD" ? "Order Item" : "Order Item";
    // Use total as single item price (qty 1)
    items.push({ title, priceMinor: totalMinor, qty: 1 });
  }
  return items.slice(0, 10);
}

function findOrderRef(text: string): string | undefined {
  const m = text.match(
    /(?:order(?:\s*id)?|order\s*#|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,})/i,
  );
  return m?.[1];
}

function domainFrom(from: string): string {
  const m = from.match(/@([a-z0-9.-]+)/i);
  return m ? m[1].toUpperCase() : "UNKNOWN";
}

/** Last-resort parser. Matches any message that looks receipt-ish and applies
 * weak heuristics. Always `canParse` when receipt hints are present, so it is
 * the registry fallback, never a "specific hit". */
export class GenericHeuristicParser implements MerchantParser {
  readonly id = "generic";
  readonly merchant = "GENERIC";

  canParse(msg: RawEmailMessage): boolean {
    const hay = `${msg.subject}\n${msg.text}`;
    return RECEIPT_HINTS.some((re) => re.test(hay)) || /\d[\d,]*(?:\.\d{2})/.test(msg.text);
  }

  parse(msg: RawEmailMessage): ParsedPurchase {
    const currency = detectCurrency(msg.text);
    const totalMinor = parseAmountMinor(msg.text, currency);
    const orderRef = findOrderRef(msg.text) ?? findOrderRef(msg.subject);
    const items = parseItems(msg.text, totalMinor, currency);
    const credit = detectCreditSignal(msg.subject, msg.text, totalMinor, currency);
    const delivery = detectDeliveryFromText(msg.subject, msg.text);
    return {
      merchant: domainFrom(msg.from),
      orderRef,
      purchasedAt: msg.receivedAt,
      currency,
      totalMinor,
      items,
      confidence: 0.2,
      parserId: this.id,
      ...(credit ? { credit } : {}),
      deliveryStatus: delivery.deliveryStatus,
      etaAt: delivery.etaAt,
      trackingCode: delivery.trackingCode,
    };
  }
}

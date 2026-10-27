import { detectDeliveryFromText } from "@worn/shared";
import { detectCreditSignal } from "../credit-detect.js";
import type { MerchantParser, ParsedPurchase, RawEmailMessage } from "../types.js";

/** Shared base for the top-5 merchant stub parsers. Each subclass only declares
 * its identity and detection hints; extraction is heuristic and intentionally
 * partial — the spike gates how much real accuracy we invest here. */
export abstract class BaseMerchantParser implements MerchantParser {
  abstract readonly id: string;
  abstract readonly merchant: string;
  protected abstract readonly domains: string[];
  protected abstract readonly subjects: string[];

  canParse(msg: RawEmailMessage): boolean {
    const from = msg.from.toLowerCase();
    const subject = msg.subject.toLowerCase();
    const domainHit = this.domains.some((d) => from.includes(d));
    const subjectHit = this.subjects.some((s) => subject.includes(s));
    return domainHit || subjectHit;
  }

  parse(msg: RawEmailMessage): ParsedPurchase {
    const currency = this.detectCurrency(msg.text);
    const totalMinor = this.extractTotal(msg.text, currency);
    const items = this.extractItems(msg.text, totalMinor, currency);
    const credit = detectCreditSignal(msg.subject, msg.text, totalMinor, currency);
    return {
      merchant: this.merchant,
      orderRef: this.extractOrderRef(msg.text) ?? this.extractOrderRef(msg.subject),
      purchasedAt: msg.receivedAt,
      currency,
      totalMinor,
      items,
      confidence: 0.5,
      parserId: this.id,
      ...(credit ? { credit } : {}),
      ...this.extractDelivery(msg),
    };
  }

  protected extractDelivery(msg: RawEmailMessage): Partial<ParsedPurchase> {
    const detected = detectDeliveryFromText(msg.subject, msg.text);
    return {
      deliveryStatus: detected.deliveryStatus,
      etaAt: detected.etaAt,
      trackingCode: detected.trackingCode,
    };
  }

  protected detectCurrency(text: string): string {
    if (/₹/.test(text)) return "INR";
    if (/\bRs\.?\b/i.test(text)) return "INR";
    if (/\bINR\b/i.test(text)) return "INR";
    if (/paid\s+via\s+upi/i.test(text)) return "INR";
    if (/\bUPI\b/i.test(text)) return "INR";
    if (/\$/.test(text)) return "USD";
    if (/\bUSD\b/i.test(text)) return "USD";
    return "INR";
  }

  private parseAmountToNumber(raw: string): number | null {
    const cleaned = raw.replace(/,/g, "").trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  protected extractTotal(text: string, _currency: string): number {
    // Prefer grand-total phrases with word-boundary (not Subtotal)
    const phraseRe = /(?:grand\s+total|order\s+total|total\s+amount)\b[^\d]*?(?:₹|Rs\.?\s*|INR\s*|\$|USD\s*)?([\d,]+(?:\.\d{1,2})?)/gi;
    const candidates: number[] = [];
    for (const m of text.matchAll(phraseRe)) {
      const raw = m[1];
      if (!raw) continue;
      const n = this.parseAmountToNumber(raw);
      if (n !== null) candidates.push(n);
    }
    if (candidates.length > 0) {
      return Math.round(Math.max(...candidates) * 100);
    }

    // Fallback: scan lines with total/amount paid but exclude subtotal-only lines
    const sanitizedForFallback = text.replace(/(?:order(?:\s*id)?|order\s*#|#)\s*[:#]?\s*[A-Z0-9][A-Z0-9-]*/gi, " ");
    const lines = sanitizedForFallback.split(/\r?\n/);
    const grandPhrase = /(?:grand\s+total|order\s+total|total\s+amount)\b/i;
    for (const line of lines) {
      if (/\bsub\s*total\b/i.test(line) && !grandPhrase.test(line)) continue;
      if (/(?:\btotal\b|amount\s+paid)/i.test(line)) {
        // Only extract the amount that follows the keyword, not any unrelated numbers on same line
        const re = /(?:\btotal\b|amount\s+paid)\b[^\d]*?(?:₹|Rs\.?\s*|INR\s*|\$|USD\s*)?([\d,]+(?:\.\d{1,2})?)/gi;
        let found = false;
        for (const m of line.matchAll(re)) {
          const raw = m[1];
          if (!raw) continue;
          const n = this.parseAmountToNumber(raw);
          if (n !== null) {
            candidates.push(n);
            found = true;
          }
        }
        // If keyword line didn't yield a captured amount, fallback to any numbers on that line
        if (!found) {
          const nums = line.match(/\b\d[\d,]*\.\d{1,2}\b|\b\d[\d,]*\b/g) ?? [];
          for (const raw of nums) {
            const n = this.parseAmountToNumber(raw);
            if (n !== null) candidates.push(n);
          }
        }
      }
    }
    if (candidates.length > 0) {
      return Math.round(Math.max(...candidates) * 100);
    }
    // Last resort: original single-match fallback with word-boundary
    const m = text.match(/(?:\btotal\b|total\s+amount|amount\s+paid|order\s+total)\s*[:-]?\s*/i);
    if (m && m.index !== undefined) {
      const rest = text.slice(m.index + m[0].length);
      const num = rest.match(/[\d,]+(?:\.\d{2})?/);
      const raw = num?.[0] ?? "0";
      const n = this.parseAmountToNumber(raw);
      if (n !== null) return Math.round(n * 100);
    }
    return 0;
  }

  protected extractOrderRef(text: string): string | undefined {
    const m = text.match(
      /(?:order(?:\s*id)?|order\s*#)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,})/i,
    );
    return m?.[1];
  }

  protected extractItems(
    text: string,
    totalMinor?: number,
    currency?: string,
  ): ParsedPurchase["items"] {
    const total = totalMinor ?? this.extractTotal(text, currency ?? "INR");
    void currency;
    const items: ParsedPurchase["items"] = [];
    const lines = text.split(/\r?\n/);
    const totalKeywords =
      /(?:grand\s+total|order\s+total|total\s+amount|\bsub\s*total\b|\binvoice\s+total\b|\btotal\b|amount\s+paid|order\s+id|invoice)/i;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (totalKeywords.test(line)) {
        if (!/(?:\d+\s*[xX×]|\bQty\b|\bQuantity\b|•|-)/.test(line)) {
          if (line.length < 80 && /(?:total|amount)/i.test(line)) continue;
        }
      }
      if (!/(?:₹|\$|Rs\.?|INR|USD)/i.test(line) && !/\d+\.\d{2}/.test(line)) continue;

      let m = line.match(/(\d+)\s*[xX×]\s*(.+?)\s*[-–—]\s*(?:₹|Rs\.?\s*|INR\s*|\$|USD\s*)?([\d,]+\.\d{1,2})/);
      if (m) {
        const qty = Number(m[1]);
        const title = m[2]!.trim().replace(/^[•*-]\s*/, "").trim();
        const price = this.parseAmountToNumber(m[3]!);
        if (title && price !== null && Number.isFinite(qty) && qty > 0) {
          items.push({ title: title.slice(0, 120), priceMinor: Math.round(price * 100), qty });
          continue;
        }
      }
      m = line.match(/(.+?)\s*Qty\s*[:-]?\s*(\d+)\s*.*?Price\s*[:-]?\s*(?:₹|Rs\.?\s*|INR\s*|\$|USD\s*)?([\d,]+\.\d{1,2})/i);
      if (m) {
        const title = m[1]!.trim().replace(/^[•*-]\s*/, "").trim() || "Item";
        const qty = Number(m[2]);
        const price = this.parseAmountToNumber(m[3]!);
        if (price !== null && Number.isFinite(qty) && qty > 0) {
          items.push({ title: title.slice(0, 120), priceMinor: Math.round(price * 100), qty });
          continue;
        }
      }
      m = line.match(/^[•*-]\s*(.+?)\s*[-–—]?\s*(?:₹|Rs\.?\s*|INR\s*|\$|USD\s*)?([\d,]+\.\d{1,2})\s*$/);
      if (m) {
        const title = m[1]!.trim();
        const price = this.parseAmountToNumber(m[2]!);
        if (title && price !== null && !totalKeywords.test(title)) {
          items.push({ title: title.slice(0, 120), priceMinor: Math.round(price * 100), qty: 1 });
          continue;
        }
      }
      const numeric = line.match(/([\d,]+\.\d{1,2})/);
      if (numeric) {
        const p = this.parseAmountToNumber(numeric[1]!);
        if (p !== null) {
          const idx = line.lastIndexOf(numeric[1]!);
          let title = line.slice(0, idx).trim();
          title = title.replace(/^[•*\d\sxX×-]+/, "").replace(/[:–—-]\s*$/, "").trim();
          title = title.replace(/^(?:₹|Rs\.?|INR|\$|USD)\s*/i, "").trim();
          title = title.replace(/[₹$]\s*$/, "").trim();
          if (title.length >= 3 && !totalKeywords.test(title) && title.length < 120) {
            if (!/order\s*(?:id|#)/i.test(title)) {
              if (!/^\d{1,2}\s+\w+\s+\d{4}$/.test(title)) {
                items.push({ title: title.slice(0, 120), priceMinor: Math.round(p * 100), qty: 1 });
                continue;
              }
            }
          }
        }
      }
    }

    if (items.length === 0 && total > 0) {
      const meaningful = lines.map((l) => l.trim()).find((l) => l.length > 5 && !totalKeywords.test(l) && !/order\s*id/i.test(l));
      const title = meaningful ? meaningful.slice(0, 80) : `${this.merchant} Order Item`;
      items.push({ title, priceMinor: total, qty: 1 });
    }
    return items.slice(0, 10);
  }
}

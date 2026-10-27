/**
 * U007 — Detect EMI / BNPL due signals from SMS (or email) bodies.
 * Tracker only — WORN is not a lender and does not pay EMIs.
 */

export type ParsedEmiSignal = {
  provider: string;
  merchant: string | null;
  /** Remaining principal when present; else installment × estimated months. */
  principalMinor: number;
  remainingMinor: number;
  installmentMinor: number;
  /** YYYY-MM-DD */
  nextDueOn: string;
  currency: string;
};

const EMI_SIGNAL_RE =
  /\b(?:emi|bnp[l]?|installment|instalment|easy\s*emi|pay\s*in\s*\d+)\b/i;

const PROVIDER_RE =
  /\b(simpl|lazypay|flipkart\s*pay\s*later|amazon\s*pay\s*later|hdfc|axis|icici|sbi|bajaj\s*finserv|zestmoney|kreditbee)\b/i;

function parseAmountToMinor(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function detectCurrency(text: string): string {
  if (/₹/.test(text) || /\bRs\.?\b/i.test(text) || /\bINR\b/i.test(text)) {
    return "INR";
  }
  if (/\$/.test(text) || /\bUSD\b/i.test(text)) return "USD";
  return "INR";
}

function extractAmountNear(
  text: string,
  labels: RegExp,
): number | null {
  const re = new RegExp(
    `${labels.source}\\s*(?:of|:)?\\s*(?:₹|Rs\\.?\\s*|INR\\s*|\\$|USD\\s*)?([\\d,]+(?:\\.\\d{1,2})?)`,
    "i",
  );
  const m = text.match(re);
  if (m?.[1]) return parseAmountToMinor(m[1]);
  const re2 = new RegExp(
    `(?:₹|Rs\\.?\\s*|INR\\s*|\\$|USD\\s*)([\\d,]+(?:\\.\\d{1,2})?)\\s*${labels.source}`,
    "i",
  );
  const m2 = text.match(re2);
  if (m2?.[1]) return parseAmountToMinor(m2[1]);
  return null;
}

function extractDueOn(text: string, fallbackNow = new Date()): string | null {
  const iso = text.match(
    /(?:due\s*(?:on|by|date)?|next\s*due)\s*[:-]?\s*(\d{4}-\d{2}-\d{2})/i,
  );
  if (iso?.[1]) return iso[1];

  const dmy = text.match(
    /(?:due\s*(?:on|by|date)?|next\s*due)\s*[:-]?\s*(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/i,
  );
  if (dmy) {
    let day = Number(dmy[1]);
    let month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (!day || !month || !year) return null;
    if (year < 100) year += 2000;
    // Prefer DD/MM when day > 12 (India SMS).
    if (day <= 12 && month > 12) {
      const tmp = day;
      day = month;
      month = tmp;
    } else if (day > 12) {
      // already DD/MM
    } else {
      // Ambiguous — treat as DD/MM for India EMI SMS.
    }
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
  }

  // "due tomorrow" / "due today"
  if (/\bdue\s+today\b/i.test(text)) {
    return formatYmd(fallbackNow);
  }
  if (/\bdue\s+tomorrow\b/i.test(text)) {
    const t = new Date(fallbackNow.getTime() + 86_400_000);
    return formatYmd(t);
  }
  return null;
}

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function extractMerchant(text: string): string | null {
  const m = text.match(
    /(?:at|for|on)\s+([A-Za-z][A-Za-z0-9&.\s]{1,40}?)(?:\s+(?:purchase|order|emi|installment)|[.!,]|$)/i,
  );
  const name = m?.[1]?.trim();
  if (!name || /^(your|the|an|a)\b/i.test(name)) return null;
  return name.slice(0, 80);
}

/**
 * Parse EMI due SMS/email into a plan draft. Returns null when the message
 * is not an EMI/BNPL due reminder with a usable installment amount.
 */
export function detectEmiSignal(
  subject: string,
  text: string,
  now: Date = new Date(),
): ParsedEmiSignal | null {
  const hay = `${subject}\n${text}`;
  if (!EMI_SIGNAL_RE.test(hay)) return null;

  const installment =
    extractAmountNear(hay, /(?:emi|installment|instalment|due)\s*(?:amount|of)?/) ??
    extractAmountNear(hay, /amount\s*due/) ??
    null;
  if (installment === null || installment <= 0) return null;

  const remaining =
    extractAmountNear(hay, /(?:remaining|outstanding|balance|principal)/) ??
    installment * 3;
  const principal =
    extractAmountNear(hay, /(?:principal|loan\s*amount|financed)/) ?? remaining;

  const nextDueOn = extractDueOn(hay, now);
  if (!nextDueOn) return null;

  const providerMatch = hay.match(PROVIDER_RE);
  const provider = providerMatch
    ? providerMatch[1]!.replace(/\s+/g, " ").trim()
    : "EMI";

  return {
    provider,
    merchant: extractMerchant(hay),
    principalMinor: principal,
    remainingMinor: remaining,
    installmentMinor: installment,
    nextDueOn,
    currency: detectCurrency(hay),
  };
}

/**
 * The order reference in a merchant email. A ref has at least one digit, so ordinary words after
 * "order" ("Order Confirmation", "your order has been placed") are never one, and an explicit
 * label ("Order ID", "Order No.", "Order #") wins over a bare "order".
 */
const REF = "([A-Z0-9][A-Z0-9-]{4,})";

const PATTERNS = [
  new RegExp(`\\border\\s*(?:id|no\\.?|number|#)\\s*[:#.]?\\s*${REF}`, "gi"),
  new RegExp(`\\border\\s*[:#]?\\s*${REF}`, "gi"),
];

const GENERIC_HASH = new RegExp(`#\\s*${REF}`, "gi");

function firstWithDigit(text: string, re: RegExp): string | undefined {
  for (const m of text.matchAll(re)) {
    if (m[1] && /\d/.test(m[1])) return m[1];
  }
  return undefined;
}

/** `allowBareHash`: also accept "#ABC123" with no "order" before it (the generic parser). */
export function extractOrderRef(text: string, opts: { allowBareHash?: boolean } = {}): string | undefined {
  for (const re of PATTERNS) {
    const ref = firstWithDigit(text, re);
    if (ref) return ref;
  }
  return opts.allowBareHash ? firstWithDigit(text, GENERIC_HASH) : undefined;
}

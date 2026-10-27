import { fractionDigits, toMinor } from '@worn/shared';

/** The largest amount the app accepts from a text field, in minor units (₹1 crore). */
export const MAX_TYPED_MINOR = 10_000_000_00;

/**
 * A typed amount such as "500", "1,250.50" in minor units, or null when it is
 * not a positive number with at most the currency's decimal places.
 * `Number("")` is 0 and `Number("1e3")` is 1000, so the text is matched first.
 */
export function parseAmountInput(raw: string, currency = 'INR'): number | null {
  const t = raw.trim().replace(/,/g, '');
  const digits = fractionDigits(currency);
  const pattern = digits > 0 ? new RegExp(`^\\d+(\\.\\d{0,${digits}})?$`) : /^\d+$/;
  if (!pattern.test(t)) return null;
  const minor = toMinor(Number(t), currency);
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor > MAX_TYPED_MINOR) return null;
  return minor;
}

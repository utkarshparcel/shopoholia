/** Minor-unit (integer) money helpers. All amounts are integer minor units
 * (e.g. paise, cents) to avoid floating point drift. */

export const DEFAULT_CURRENCY = "INR";

const CURRENCY_FRACTION_DIGITS: Record<string, number> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
};

export function fractionDigits(currency: string): number {
  return CURRENCY_FRACTION_DIGITS[currency.toUpperCase()] ?? 2;
}

/** Convert a major-unit decimal (e.g. 12.34) into integer minor units (1234). */
export function toMinor(amount: number, currency = DEFAULT_CURRENCY): number {
  const factor = 10 ** fractionDigits(currency);
  return Math.round(amount * factor);
}

/** Convert integer minor units (1234) back into a major-unit number (12.34). */
export function fromMinor(minor: number, currency = DEFAULT_CURRENCY): number {
  const factor = 10 ** fractionDigits(currency);
  return minor / factor;
}

export function addMinor(a: number, b: number): number {
  return a + b;
}

export function subtractMinor(a: number, b: number): number {
  return a - b;
}

/** Safe subtraction that throws instead of returning a negative balance. */
export function spendMinor(balance: number, amount: number): number {
  const next = balance - amount;
  if (next < 0) {
    throw new Error("Insufficient balance");
  }
  return next;
}

/** Format integer minor units for display, e.g. 1234 -> "₹12.34" / "12.34". */
export function formatMinor(
  minor: number,
  currency = DEFAULT_CURRENCY,
  locale = "en-IN",
): string {
  const major = fromMinor(minor, currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(major);
  } catch {
    return `${major.toFixed(fractionDigits(currency))} ${currency}`;
  }
}

export function isNonNegativeMinor(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

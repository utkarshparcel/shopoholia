/**
 * W003 — Closet locale currency picker helpers (IN ₹ / US $ / UK £).
 * Pure prefs + formatting; UI/onboarding wires persistence.
 */

import { DEFAULT_CURRENCY, formatMinor } from "./money.js";

export const CLOSET_PICKER_CURRENCIES = ["INR", "USD", "GBP"] as const;
export type ClosetPickerCurrency = (typeof CLOSET_PICKER_CURRENCIES)[number];

export type ClosetCurrencyOption = {
  currency: ClosetPickerCurrency;
  /** Short region tag on picker chips. */
  regionTag: "IN" | "US" | "UK";
  /** Intl locale for `formatMinor`. */
  locale: string;
  /** Chip label e.g. "India · ₹". */
  label: string;
  symbol: string;
};

export const CLOSET_CURRENCY_OPTIONS: readonly ClosetCurrencyOption[] = [
  {
    currency: "INR",
    regionTag: "IN",
    locale: "en-IN",
    label: "India · ₹",
    symbol: "₹",
  },
  {
    currency: "USD",
    regionTag: "US",
    locale: "en-US",
    label: "US · $",
    symbol: "$",
  },
  {
    currency: "GBP",
    regionTag: "UK",
    locale: "en-GB",
    label: "UK · £",
    symbol: "£",
  },
] as const;

export type ClosetMoneyPrefs = {
  currency: ClosetPickerCurrency;
  locale: string;
};

export function isClosetPickerCurrency(
  value: string | null | undefined,
): value is ClosetPickerCurrency {
  if (!value) return false;
  return (CLOSET_PICKER_CURRENCIES as readonly string[]).includes(
    value.trim().toUpperCase(),
  );
}

/** Resolve picker option; unknown currency falls back to INR. */
export function closetCurrencyOption(currency: string): ClosetCurrencyOption {
  const upper = currency.trim().toUpperCase();
  return (
    CLOSET_CURRENCY_OPTIONS.find((o) => o.currency === upper) ??
    CLOSET_CURRENCY_OPTIONS[0]!
  );
}

export function localeForCurrency(currency: string): string {
  return closetCurrencyOption(currency).locale;
}

/**
 * Default Closet currency from a BCP-47 locale string.
 * - IN / hi → INR
 * - GB / UK → GBP
 * - US → USD
 * - Missing / unknown → INR (India-first product default)
 */
export function defaultCurrencyFromLocale(
  locale?: string | null,
): ClosetPickerCurrency {
  if (!locale?.trim()) return DEFAULT_CURRENCY as ClosetPickerCurrency;

  const normalized = locale.trim().replace(/_/g, "-").toLowerCase();
  const parts = normalized.split("-").filter(Boolean);
  const lang = parts[0] ?? "";
  const region = (parts[parts.length - 1] ?? "").toUpperCase();

  if (lang === "hi" || region === "IN") return "INR";
  if (region === "GB" || region === "UK") return "GBP";
  if (region === "US") return "USD";

  // Language-only en without region → global EN beachhead uses USD
  if (lang === "en" && parts.length === 1) return "USD";

  return DEFAULT_CURRENCY as ClosetPickerCurrency;
}

/**
 * Resolve persisted or onboarding prefs.
 * Explicit picker currency wins; otherwise default from locale.
 */
export function resolveClosetMoneyPrefs(
  input?: {
    currency?: string | null;
    locale?: string | null;
  } | null,
): ClosetMoneyPrefs {
  const currency = isClosetPickerCurrency(input?.currency)
    ? (input!.currency!.trim().toUpperCase() as ClosetPickerCurrency)
    : defaultCurrencyFromLocale(input?.locale);
  const option = closetCurrencyOption(currency);
  return { currency: option.currency, locale: option.locale };
}

/** Format minor units using Closet money prefs (W003 / vault totals). */
export function formatMinorWithPrefs(
  minor: number,
  prefs?: Parameters<typeof resolveClosetMoneyPrefs>[0],
): string {
  const resolved = resolveClosetMoneyPrefs(prefs);
  return formatMinor(minor, resolved.currency, resolved.locale);
}

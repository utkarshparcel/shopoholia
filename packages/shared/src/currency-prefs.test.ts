import { describe, expect, it } from "vitest";
import {
  CLOSET_CURRENCY_OPTIONS,
  CLOSET_PICKER_CURRENCIES,
  closetCurrencyOption,
  defaultCurrencyFromLocale,
  formatMinorWithPrefs,
  isClosetPickerCurrency,
  localeForCurrency,
  resolveClosetMoneyPrefs,
} from "./currency-prefs.js";
import { formatMinor } from "./money.js";

describe("CLOSET_CURRENCY_OPTIONS (W003)", () => {
  it("covers IN ₹ / US $ / UK £", () => {
    expect(CLOSET_PICKER_CURRENCIES).toEqual(["INR", "USD", "GBP"]);
    expect(CLOSET_CURRENCY_OPTIONS.map((o) => o.currency)).toEqual([
      "INR",
      "USD",
      "GBP",
    ]);
    expect(CLOSET_CURRENCY_OPTIONS.map((o) => o.symbol)).toEqual([
      "₹",
      "$",
      "£",
    ]);
  });
});

describe("defaultCurrencyFromLocale", () => {
  it("defaults missing locale to INR", () => {
    expect(defaultCurrencyFromLocale(null)).toBe("INR");
    expect(defaultCurrencyFromLocale(undefined)).toBe("INR");
    expect(defaultCurrencyFromLocale("")).toBe("INR");
  });

  it("maps India locales to INR", () => {
    expect(defaultCurrencyFromLocale("en-IN")).toBe("INR");
    expect(defaultCurrencyFromLocale("hi-IN")).toBe("INR");
    expect(defaultCurrencyFromLocale("hi")).toBe("INR");
  });

  it("maps UK locales to GBP", () => {
    expect(defaultCurrencyFromLocale("en-GB")).toBe("GBP");
    expect(defaultCurrencyFromLocale("en_UK")).toBe("GBP");
  });

  it("maps US / bare en to USD", () => {
    expect(defaultCurrencyFromLocale("en-US")).toBe("USD");
    expect(defaultCurrencyFromLocale("en")).toBe("USD");
  });

  it("falls back to INR for unknown locales", () => {
    expect(defaultCurrencyFromLocale("fr-FR")).toBe("INR");
    expect(defaultCurrencyFromLocale("de")).toBe("INR");
  });
});

describe("resolveClosetMoneyPrefs / formatMinorWithPrefs", () => {
  it("persisted currency wins over locale default", () => {
    expect(resolveClosetMoneyPrefs({ currency: "gbp", locale: "en-IN" })).toEqual(
      {
        currency: "GBP",
        locale: "en-GB",
      },
    );
  });

  it("defaults from locale when currency unset", () => {
    expect(resolveClosetMoneyPrefs({ locale: "en-US" })).toEqual({
      currency: "USD",
      locale: "en-US",
    });
    expect(resolveClosetMoneyPrefs(null)).toEqual({
      currency: "INR",
      locale: "en-IN",
    });
    expect(resolveClosetMoneyPrefs(undefined)).toEqual({
      currency: "INR",
      locale: "en-IN",
    });
  });

  it("formats vault totals with picker prefs", () => {
    expect(formatMinorWithPrefs(1234, { currency: "INR" })).toBe(
      formatMinor(1234, "INR", "en-IN"),
    );
    expect(formatMinorWithPrefs(1234, { currency: "USD" })).toBe(
      formatMinor(1234, "USD", "en-US"),
    );
    expect(formatMinorWithPrefs(1234, { currency: "GBP" })).toBe(
      formatMinor(1234, "GBP", "en-GB"),
    );
    expect(formatMinorWithPrefs(1234, null)).toBe(formatMinor(1234, "INR", "en-IN"));
  });

  it("localeForCurrency / option helpers", () => {
    expect(localeForCurrency("usd")).toBe("en-US");
    expect(closetCurrencyOption("XYZ").currency).toBe("INR");
    expect(isClosetPickerCurrency("INR")).toBe(true);
    expect(isClosetPickerCurrency("JPY")).toBe(false);
    expect(isClosetPickerCurrency(null)).toBe(false);
    expect(isClosetPickerCurrency("")).toBe(false);
  });
});

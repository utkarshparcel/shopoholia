/**
 * Closet display prefs — currency (W003), copy pack (W091), fit region (W092),
 * empty-copy AB, surface-edu flag.
 * Currency helpers come from shared `currency-prefs`; Zustand persists the pick.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CLOSET_CURRENCY_OPTIONS,
  CLOSET_PICKER_CURRENCIES,
  COPY_PACK_OPTIONS,
  defaultCurrencyFromLocale as sharedDefaultCurrencyFromLocale,
  defaultFitRegionFromCurrency,
  FIT_REGION_PACK_OPTIONS,
  getCopyPack,
  isClosetPickerCurrency,
  isCopyPackId,
  isFitRegionPackId,
  localeForCurrency as sharedLocaleForCurrency,
  normalizeFitRegionPack,
  type ClosetCopyPack,
  type ClosetPickerCurrency,
  type CopyPackId,
  type FitRegionPackId,
} from '@worn/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ClosetCurrency = ClosetPickerCurrency;

export type EmptyCopyVariant = 'found_money' | 'outfit';

export type { CopyPackId, FitRegionPackId, ClosetCopyPack };

export const CLOSET_CURRENCIES = CLOSET_PICKER_CURRENCIES;

/** IN ₹ / US $ / UK £ chips for onboarding (W003). */
export const CURRENCY_PICKER_OPTIONS: readonly {
  code: ClosetCurrency;
  label: string;
  symbol: string;
  regionTag: 'IN' | 'US' | 'UK';
  /** Chip text e.g. "IN ₹". */
  chipLabel: string;
}[] = CLOSET_CURRENCY_OPTIONS.map((o) => ({
  code: o.currency,
  label: o.label,
  symbol: o.symbol,
  regionTag: o.regionTag,
  chipLabel: `${o.regionTag} ${o.symbol}`,
}));

/** W091 — EN / Hinglish copy pack chips. */
export const COPY_PACK_PICKER_OPTIONS = COPY_PACK_OPTIONS.map((p) => ({
  id: p.id,
  label: p.label,
  chipLabel: p.chipLabel,
}));

/** W092 — Fit region pack chips (IN / US / UK / GLOBAL). */
export const REGION_PACK_PICKER_OPTIONS = FIT_REGION_PACK_OPTIONS.map((o) => ({
  region: o.region,
  label: o.label,
  chipLabel: o.chipLabel,
  hint: o.hint,
}));

const PREFS_KEY = 'worn-closet-prefs';

/** Map device/locale tags → Closet display currency (shared W003). */
export function defaultCurrencyFromLocale(
  locale: string | null | undefined,
): ClosetCurrency {
  return sharedDefaultCurrencyFromLocale(locale);
}

/** Locale string for Intl when formatting the preferred currency. */
export function localeForCurrency(currency: ClosetCurrency | string): string {
  return sharedLocaleForCurrency(currency);
}

export function isClosetCurrency(value: unknown): value is ClosetCurrency {
  return typeof value === 'string' && isClosetPickerCurrency(value);
}

/** Device BCP-47 tag when available (RN / web). */
export function deviceLocaleTag(): string | undefined {
  try {
    if (typeof Intl !== 'undefined') {
      return Intl.DateTimeFormat().resolvedOptions().locale || undefined;
    }
  } catch {
    // ignore
  }
  return undefined;
}

/** Stable AB assignment — rotate when no explicit flag (W004). */
export function assignEmptyCopyVariant(seed: number = Date.now()): EmptyCopyVariant {
  return seed % 2 === 0 ? 'found_money' : 'outfit';
}

export function emptyCopyVariantFromEnv(
  env: string | undefined = process.env.EXPO_PUBLIC_EMPTY_COPY_VARIANT,
): EmptyCopyVariant | null {
  if (env === 'found_money' || env === 'outfit') return env;
  return null;
}

type ClosetPrefsState = {
  preferredCurrency: ClosetCurrency;
  currencyChosen: boolean;
  /** W091 — EN vs Hinglish vault/today strings. */
  copyPackId: CopyPackId;
  /** W092 — Fit Vault region pack (seeds templates). */
  preferredFitRegion: FitRegionPackId;
  fitRegionChosen: boolean;
  emptyCopyVariant: EmptyCopyVariant;
  surfaceEduSeen: boolean;
  /** W052 — constrain Today generator to capsule membership. */
  preferCapsuleToday: boolean;
  setPreferredCurrency: (currency: ClosetCurrency) => void;
  setCopyPackId: (id: CopyPackId) => void;
  setPreferredFitRegion: (region: FitRegionPackId) => void;
  /** Persist locale default once before / until the user taps a chip (W003). */
  seedCurrencyFromLocale: (locale?: string | null) => ClosetCurrency;
  /** Seed fit region once from currency (W092). */
  seedFitRegionFromCurrency: (currency?: ClosetCurrency | null) => FitRegionPackId;
  markSurfaceEduSeen: () => void;
  setPreferCapsuleToday: (prefer: boolean) => void;
  ensureEmptyCopyVariant: (seed?: number) => EmptyCopyVariant;
  clear: () => void;
};

function initialVariant(): EmptyCopyVariant {
  return emptyCopyVariantFromEnv() ?? assignEmptyCopyVariant(0);
}

export const useClosetPrefsStore = create<ClosetPrefsState>()(
  persist(
    (set, get) => ({
      preferredCurrency: 'INR',
      currencyChosen: false,
      copyPackId: 'en',
      preferredFitRegion: 'IN',
      fitRegionChosen: false,
      emptyCopyVariant: initialVariant(),
      surfaceEduSeen: false,
      preferCapsuleToday: false,
      setPreferredCurrency: (preferredCurrency) => {
        const patch: {
          preferredCurrency: ClosetCurrency;
          currencyChosen: true;
          preferredFitRegion?: FitRegionPackId;
        } = { preferredCurrency, currencyChosen: true };
        if (!get().fitRegionChosen) {
          patch.preferredFitRegion = defaultFitRegionFromCurrency(preferredCurrency);
        }
        set(patch);
      },
      setCopyPackId: (copyPackId) => set({ copyPackId }),
      setPreferredFitRegion: (preferredFitRegion) =>
        set({ preferredFitRegion, fitRegionChosen: true }),
      seedCurrencyFromLocale: (locale) => {
        if (get().currencyChosen) return get().preferredCurrency;
        const preferredCurrency = defaultCurrencyFromLocale(
          locale ?? deviceLocaleTag(),
        );
        const preferredFitRegion = get().fitRegionChosen
          ? get().preferredFitRegion
          : defaultFitRegionFromCurrency(preferredCurrency);
        set({
          preferredCurrency,
          currencyChosen: true,
          preferredFitRegion,
        });
        return preferredCurrency;
      },
      seedFitRegionFromCurrency: (currency) => {
        if (get().fitRegionChosen) return get().preferredFitRegion;
        const preferredFitRegion = defaultFitRegionFromCurrency(
          currency ?? get().preferredCurrency,
        );
        set({ preferredFitRegion, fitRegionChosen: true });
        return preferredFitRegion;
      },
      markSurfaceEduSeen: () => set({ surfaceEduSeen: true }),
      setPreferCapsuleToday: (preferCapsuleToday) => set({ preferCapsuleToday }),
      ensureEmptyCopyVariant: (seed = Date.now()) => {
        const fromEnv = emptyCopyVariantFromEnv();
        if (fromEnv) {
          if (get().emptyCopyVariant !== fromEnv) {
            set({ emptyCopyVariant: fromEnv });
          }
          return fromEnv;
        }
        const current = get().emptyCopyVariant;
        if (current === 'found_money' || current === 'outfit') return current;
        const next = assignEmptyCopyVariant(seed);
        set({ emptyCopyVariant: next });
        return next;
      },
      clear: () =>
        set({
          preferredCurrency: 'INR',
          currencyChosen: false,
          copyPackId: 'en',
          preferredFitRegion: 'IN',
          fitRegionChosen: false,
          emptyCopyVariant: initialVariant(),
          surfaceEduSeen: false,
          preferCapsuleToday: false,
        }),
    }),
    {
      name: PREFS_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        preferredCurrency: state.preferredCurrency,
        currencyChosen: state.currencyChosen,
        copyPackId: state.copyPackId,
        preferredFitRegion: state.preferredFitRegion,
        fitRegionChosen: state.fitRegionChosen,
        emptyCopyVariant: state.emptyCopyVariant,
        surfaceEduSeen: state.surfaceEduSeen,
        preferCapsuleToday: state.preferCapsuleToday,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ClosetPrefsState>;
        return {
          ...current,
          preferredCurrency: isClosetCurrency(p.preferredCurrency)
            ? p.preferredCurrency
            : current.preferredCurrency,
          currencyChosen: Boolean(p.currencyChosen),
          copyPackId: isCopyPackId(p.copyPackId) ? p.copyPackId : current.copyPackId,
          preferredFitRegion: isFitRegionPackId(p.preferredFitRegion)
            ? normalizeFitRegionPack(p.preferredFitRegion)
            : current.preferredFitRegion,
          fitRegionChosen: Boolean(p.fitRegionChosen),
          emptyCopyVariant:
            p.emptyCopyVariant === 'found_money' || p.emptyCopyVariant === 'outfit'
              ? p.emptyCopyVariant
              : current.emptyCopyVariant,
          surfaceEduSeen: Boolean(p.surfaceEduSeen),
          preferCapsuleToday: Boolean(p.preferCapsuleToday),
        };
      },
    },
  ),
);

export const CLOSET_PREFS_STORAGE_KEY = PREFS_KEY;

/** Active copy pack for vault / today (W091). */
export function activeCopyPack(): ClosetCopyPack {
  return getCopyPack(useClosetPrefsStore.getState().copyPackId);
}

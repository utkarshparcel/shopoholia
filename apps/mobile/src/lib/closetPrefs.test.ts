import { beforeEach, describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatMinorWithPrefs } from '@worn/shared';

import {
  CLOSET_PREFS_STORAGE_KEY,
  CURRENCY_PICKER_OPTIONS,
  defaultCurrencyFromLocale,
  localeForCurrency,
  useClosetPrefsStore,
} from './closetPrefs';
import { foundMoneyHeadline } from './foundMoney';
import { formatMinor } from './format';

async function waitForPersistedCurrency(currency: string) {
  await vi.waitFor(async () => {
    const raw = await AsyncStorage.getItem(CLOSET_PREFS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(raw).toContain(`"preferredCurrency":"${currency}"`);
  });
}

describe('closetPrefs currency (W003)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useClosetPrefsStore.setState({
      preferredCurrency: 'INR',
      currencyChosen: false,
      emptyCopyVariant: 'found_money',
      surfaceEduSeen: false,
    });
    await useClosetPrefsStore.persist.clearStorage();
  });

  it('exposes IN ₹ / US $ / UK £ picker chips from shared options', () => {
    expect(CURRENCY_PICKER_OPTIONS.map((o) => o.chipLabel)).toEqual([
      'IN ₹',
      'US $',
      'UK £',
    ]);
    expect(CURRENCY_PICKER_OPTIONS.map((o) => o.code)).toEqual([
      'INR',
      'USD',
      'GBP',
    ]);
  });

  it('defaults currency from locale via shared currency-prefs', () => {
    expect(defaultCurrencyFromLocale('en-IN')).toBe('INR');
    expect(defaultCurrencyFromLocale('en-US')).toBe('USD');
    expect(defaultCurrencyFromLocale('en-GB')).toBe('GBP');
    expect(defaultCurrencyFromLocale(null)).toBe('INR');
    expect(localeForCurrency('USD')).toBe('en-US');
  });

  it('seeds once from locale then persists preference', async () => {
    expect(useClosetPrefsStore.getState().currencyChosen).toBe(false);
    const seeded = useClosetPrefsStore.getState().seedCurrencyFromLocale('en-GB');
    expect(seeded).toBe('GBP');
    expect(useClosetPrefsStore.getState().preferredCurrency).toBe('GBP');
    expect(useClosetPrefsStore.getState().currencyChosen).toBe(true);
    await waitForPersistedCurrency('GBP');

    // Second seed must not clobber an explicit / already-seeded pick.
    useClosetPrefsStore.getState().seedCurrencyFromLocale('en-US');
    expect(useClosetPrefsStore.getState().preferredCurrency).toBe('GBP');
  });

  it('setPreferredCurrency writes preferred currency to AsyncStorage', async () => {
    useClosetPrefsStore.getState().setPreferredCurrency('USD');
    expect(useClosetPrefsStore.getState().preferredCurrency).toBe('USD');
    expect(useClosetPrefsStore.getState().currencyChosen).toBe(true);
    await waitForPersistedCurrency('USD');
  });

  it('rehydrates preferredCurrency from AsyncStorage after restart', async () => {
    await AsyncStorage.setItem(
      CLOSET_PREFS_STORAGE_KEY,
      JSON.stringify({
        state: {
          preferredCurrency: 'USD',
          currencyChosen: true,
          emptyCopyVariant: 'found_money',
          surfaceEduSeen: false,
        },
        version: 0,
      }),
    );
    expect(useClosetPrefsStore.getState().preferredCurrency).toBe('INR');
    await useClosetPrefsStore.persist.rehydrate();
    expect(useClosetPrefsStore.getState().preferredCurrency).toBe('USD');
    expect(useClosetPrefsStore.getState().currencyChosen).toBe(true);
  });

  it('formats vault totals with picker currency + locale', () => {
    expect(foundMoneyHeadline(12_345, 'USD')).toBe(
      `You have ${formatMinorWithPrefs(12_345, { currency: 'USD' })} in forgotten credit.`,
    );
    expect(formatMinor(12_345, 'GBP')).toBe(
      formatMinorWithPrefs(12_345, { currency: 'GBP' }),
    );
    expect(formatMinor(12_345, 'INR')).toMatch(/^₹/);
  });
});

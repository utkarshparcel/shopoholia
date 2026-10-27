/**
 * Acceptance verification for W001–W007 (Wave A first-session usable).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { SAMPLE_MYNTRA_CREDIT, demoExitedProps } from './firstDelight';
import {
  DEMO_BADGE_LABEL,
  emptyCtaTapProps,
  emptyStateCopy,
  isSampleCreditAccount,
} from './emptyDemo';
import {
  CURRENCY_PICKER_OPTIONS,
  defaultCurrencyFromLocale,
  localeForCurrency,
  useClosetPrefsStore,
} from './closetPrefs';
import {
  CLOSET_RESTORE_FALLBACK_TOAST,
  hydrateActiveSurface,
  shouldToastRestoreFallback,
} from './closetRestore';
import {
  enqueueVaultAdd,
  flushVaultAddQueue,
} from './vaultAddQueue';
import {
  celebrationHapticForSource,
  celebrationVariantForSource,
} from './celebrationVariants';
import {
  delightHapticForCelebrationSource,
  setDelightHapticsDeps,
} from './delightHaptics';
import { useClosetStore } from '@/src/stores/closet';

describe('W001-DEMO-EXIT-CLEAR', () => {
  beforeEach(() => useClosetStore.getState().clear());

  it('exposes Demo badge and detects sample credit', () => {
    expect(DEMO_BADGE_LABEL).toBe('Sample');
    expect(
      isSampleCreditAccount({
        isDemo: true,
        merchant: SAMPLE_MYNTRA_CREDIT.merchant,
        balanceCacheMinor: SAMPLE_MYNTRA_CREDIT.balanceMinor,
      }),
    ).toBe(true);
    expect(
      isSampleCreditAccount({
        merchant: SAMPLE_MYNTRA_CREDIT.merchant,
        balanceCacheMinor: SAMPLE_MYNTRA_CREDIT.balanceMinor,
      }),
    ).toBe(true);
  });

  it('Exit sample clears ledger + demo_exited props', () => {
    useClosetStore.getState().startDelightClock(1_000);
    useClosetStore.getState().seedDemoGiftCard();
    expect(useClosetStore.getState().demoAccount).not.toBeNull();

    const props = demoExitedProps(useClosetStore.getState().delightStartedAt, 5_000);
    expect(props).toEqual({ seconds: 4, source: 'demo' });

    useClosetStore.getState().exitDemoSample();
    expect(useClosetStore.getState().demoAccount).toBeNull();
    expect(useClosetStore.getState().demoSampleDismissed).toBe(true);
    expect(useClosetStore.getState().justConnected).toBe(false);
  });
});

describe('W002-OFFLINE-VAULT-ADD', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('queues offline then flushes idempotently; surfaces flush error', async () => {
    const item = await enqueueVaultAdd({
      kind: 'GIFT_CARD',
      merchant: 'Amazon',
      currency: 'INR',
      balanceMinor: 10_00,
      idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    expect(item.body.idempotencyKey).toBe(item.id);

    const fail = await flushVaultAddQueue(async () => {
      throw new Error('offline sync failed');
    });
    expect(fail.items).toHaveLength(1);
    expect(fail.lastFlushError).toMatch(/offline sync failed/i);

    const addCredit = vi.fn(async () => ({ ok: true }));
    const ok = await flushVaultAddQueue(addCredit);
    expect(addCredit).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: item.id }),
    );
    expect(ok.items).toHaveLength(0);
    expect(ok.lastFlushError).toBeNull();
  });
});

describe('W003-CURRENCY-PICKER', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useClosetPrefsStore.getState().clear();
  });

  it('defaults from locale, persists, and formats with matching locale', () => {
    expect(CURRENCY_PICKER_OPTIONS.map((o) => o.code)).toEqual(['INR', 'USD', 'GBP']);
    expect(defaultCurrencyFromLocale('en-IN')).toBe('INR');
    expect(defaultCurrencyFromLocale('en-US')).toBe('USD');
    expect(defaultCurrencyFromLocale('en-GB')).toBe('GBP');
    expect(localeForCurrency('USD')).toBe('en-US');

    useClosetPrefsStore.getState().setPreferredCurrency('GBP');
    expect(useClosetPrefsStore.getState().preferredCurrency).toBe('GBP');
    expect(useClosetPrefsStore.getState().currencyChosen).toBe(true);
  });
});

describe('W004-EMPTY-COPY-AB', () => {
  it('rotates found-money vs outfit copy and builds empty_cta_tap props', () => {
    const found = emptyStateCopy('vault', 'found_money');
    const outfit = emptyStateCopy('vault', 'outfit');
    expect(found.title).not.toBe(outfit.title);
    expect(found.variant).toBe('found_money');
    expect(outfit.variant).toBe('outfit');

    const todayFound = emptyStateCopy('today', 'found_money');
    const todayOutfit = emptyStateCopy('today', 'outfit');
    expect(todayFound.message).not.toBe(todayOutfit.message);

    expect(emptyCtaTapProps('vault', 'found_money', 'primary')).toEqual({
      surface: 'vault',
      variant: 'found_money',
      cta: 'primary',
    });
  });
});

describe('W005-CLOSET-RESTORE-SAFE', () => {
  it('corrupt AsyncStorage falls back to Play + toast', () => {
    const corrupt = hydrateActiveSurface('{broken');
    expect(corrupt.surface).toBe('play');
    expect(corrupt.recovered).toBe(true);
    expect(shouldToastRestoreFallback(corrupt)).toBe(true);
    expect(CLOSET_RESTORE_FALLBACK_TOAST).toMatch(/Play/i);
  });
});

describe('W006-SURFACE-TOGGLE-EDU', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useClosetPrefsStore.getState().clear();
  });

  it('one-time edu flag starts unseen and can be skipped/marked', () => {
    expect(useClosetPrefsStore.getState().surfaceEduSeen).toBe(false);
    useClosetPrefsStore.getState().markSurfaceEduSeen();
    expect(useClosetPrefsStore.getState().surfaceEduSeen).toBe(true);
  });
});

describe('W007-CELEBRATION-VARIANTS', () => {
  afterEach(() => {
    setDelightHapticsDeps(null);
  });

  it('distinct copy/haptic per source; Reduce Motion safe', async () => {
    const demo = celebrationVariantForSource(50_000, 'demo');
    const manual = celebrationVariantForSource(50_000, 'manual');
    const oauth = celebrationVariantForSource(50_000, 'oauth');
    expect(demo.body).toMatch(/Not real money/i);
    expect(manual.body).not.toBe(oauth.body);
    expect(celebrationHapticForSource('demo')).toBe('light');
    expect(celebrationHapticForSource('manual')).toBe('medium');

    const impactAsync = vi.fn(async () => undefined);
    setDelightHapticsDeps({
      isReduceMotionEnabled: async () => true,
      impactAsync,
      platformOS: 'ios',
    });
    expect(await delightHapticForCelebrationSource('manual')).toBe(false);
    expect(impactAsync).not.toHaveBeenCalled();

    setDelightHapticsDeps({
      isReduceMotionEnabled: async () => false,
      impactAsync,
      platformOS: 'ios',
    });
    expect(await delightHapticForCelebrationSource('demo')).toBe(true);
    expect(impactAsync).toHaveBeenCalledWith('light');
  });
});

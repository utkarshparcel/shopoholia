import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const posthog = vi.hoisted(() => ({ capture: vi.fn(), stop: vi.fn() }));

vi.mock('@/src/lib/posthog', () => ({ startPostHog: vi.fn(() => posthog) }));

import { startPostHog } from '@/src/lib/posthog';

import {
  INSTALL_TRACKED_KEY,
  initAnalyticsFromEnv,
  resetAnalyticsSink,
  resetInstallTrackingForTests,
  setAnalyticsSink,
  trackEvent,
  trackInstallOnce,
} from './analytics';

describe('trackEvent', () => {
  afterEach(() => {
    resetAnalyticsSink();
    delete process.env.EXPO_PUBLIC_ANALYTICS_WEBHOOK_URL;
    delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
  });

  it('forwards events to the configured sink', () => {
    const sink = vi.fn();
    setAnalyticsSink(sink);

    trackEvent('checkout', { orderId: 'order-1', tier: 'EXPRESS' });

    expect(sink).toHaveBeenCalledWith('checkout', {
      orderId: 'order-1',
      tier: 'EXPRESS',
    });
  });

  it('strips PII props before forwarding', () => {
    const sink = vi.fn();
    setAnalyticsSink(sink);
    trackEvent('credit_added', {
      email: 'a@b.co',
      merchant: 'Amazon',
      amountMinor: 100,
    });
    expect(sink).toHaveBeenCalledWith('credit_added', {
      merchant: 'Amazon',
      amountMinor: 100,
    });
  });

  it('supports funnel event names including closet flows', () => {
    const sink = vi.fn();
    setAnalyticsSink(sink);

    const events = [
      'install',
      'consent_granted',
      'ingestion_connected',
      'found_money_viewed',
      'time_to_found_money',
      'sms_ingested',
      'onboarding_skipped',
      'email_prompt_skipped',
      'demo_exited',
      'empty_cta_tap',
      'add_another_tap',
      'return_portal_open',
      'expiry_countdown_viewed',
      'use_this_weekend_tap',
      'merchant_deeplink_return',
      'soonest_focus_toggled',
      'balance_recheck_tap',
      'balance_recheck_reminder',
      'loyalty_first_celebration',
    ] as const;

    for (const name of events) {
      trackEvent(name);
    }

    expect(sink).toHaveBeenCalledTimes(events.length);
  });

  it('forwards W008 skip-path events with seconds', () => {
    const sink = vi.fn();
    setAnalyticsSink(sink);
    trackEvent('onboarding_skipped', { seconds: 12 });
    trackEvent('email_prompt_skipped', { seconds: 45 });
    expect(sink).toHaveBeenCalledWith('onboarding_skipped', { seconds: 12 });
    expect(sink).toHaveBeenCalledWith('email_prompt_skipped', { seconds: 45 });
  });

  it('initAnalyticsFromEnv installs an HTTP sink when webhook env is set', async () => {
    process.env.EXPO_PUBLIC_ANALYTICS_WEBHOOK_URL = 'https://hooks.example/m';
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;

    try {
      expect(initAnalyticsFromEnv()).toBe(true);
      trackEvent('consent_granted', { scope: 'EMAIL' });
      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
      expect(fetchImpl.mock.calls[0]![0]).toBe('https://hooks.example/m');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('initAnalyticsFromEnv is a no-op without env', () => {
    expect(initAnalyticsFromEnv()).toBe(false);
  });

  it('never throws, even when the sink does', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setAnalyticsSink(() => {
      throw new Error('sink down');
    });

    expect(() => trackEvent('checkout')).not.toThrow();
    vi.restoreAllMocks();
  });
});

describe('default sink', () => {
  afterEach(() => {
    resetAnalyticsSink();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.mocked(startPostHog).mockClear();
    posthog.capture.mockClear();
    posthog.stop.mockClear();
  });

  it('sends events to PostHog when EXPO_PUBLIC_POSTHOG_KEY is set', () => {
    vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', 'phc_test');
    vi.stubEnv('EXPO_PUBLIC_POSTHOG_HOST', 'https://eu.i.posthog.com');

    trackEvent('install');
    trackEvent('checkout', { tier: 'EXPRESS' });

    expect(startPostHog).toHaveBeenCalledExactlyOnceWith('phc_test', 'https://eu.i.posthog.com');
    expect(posthog.capture.mock.calls).toEqual([
      ['install', undefined],
      ['checkout', { tier: 'EXPRESS' }],
    ]);

    resetAnalyticsSink();
    expect(posthog.stop).toHaveBeenCalledOnce();
  });

  it('logs to the console in dev without a key', () => {
    vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', '');
    vi.stubEnv('NODE_ENV', 'development');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    trackEvent('share', { orderId: 'order-1' });

    expect(info).toHaveBeenCalledWith('[analytics]', 'share', { orderId: 'order-1' });
    expect(startPostHog).not.toHaveBeenCalled();
  });

  it('does nothing in release builds without a key', () => {
    vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', '');
    vi.stubEnv('NODE_ENV', 'production');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const globals = globalThis as { __DEV__?: boolean };
    globals.__DEV__ = false;
    try {
      trackEvent('share');
    } finally {
      globals.__DEV__ = true;
    }

    expect(info).not.toHaveBeenCalled();
    expect(startPostHog).not.toHaveBeenCalled();
  });
});

describe('trackInstallOnce', () => {
  const sink = vi.fn();

  beforeEach(async () => {
    sink.mockClear();
    setAnalyticsSink(sink);
    resetInstallTrackingForTests();
    await AsyncStorage.removeItem(INSTALL_TRACKED_KEY);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetAnalyticsSink();
  });

  it('sends install once, across cold starts', async () => {
    expect(await trackInstallOnce()).toBe(true);
    resetInstallTrackingForTests(); // next launch
    expect(await trackInstallOnce()).toBe(false);

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith('install', undefined);
    expect(await AsyncStorage.getItem(INSTALL_TRACKED_KEY)).toBeTruthy();
  });

  it('sends it once when called twice at the same time', async () => {
    const [first, second] = await Promise.all([trackInstallOnce(), trackInstallOnce()]);

    expect([first, second]).toEqual([true, true]);
    expect(sink).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the flag is already set', async () => {
    await AsyncStorage.setItem(INSTALL_TRACKED_KEY, '2026-01-01T00:00:00.000Z');

    expect(await trackInstallOnce()).toBe(false);
    expect(sink).not.toHaveBeenCalled();
  });

  it('sends nothing when storage fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));

    expect(await trackInstallOnce()).toBe(false);
    expect(sink).not.toHaveBeenCalled();
  });
});

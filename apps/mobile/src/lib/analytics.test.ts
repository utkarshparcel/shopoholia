import { afterEach, describe, expect, it, vi } from 'vitest';

const posthog = vi.hoisted(() => ({ capture: vi.fn(), stop: vi.fn() }));

vi.mock('@/src/lib/posthog', () => ({ startPostHog: vi.fn(() => posthog) }));

import { startPostHog } from '@/src/lib/posthog';

import { resetAnalyticsSink, setAnalyticsSink, trackEvent } from './analytics';

describe('trackEvent', () => {
  afterEach(() => {
    resetAnalyticsSink();
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

  it('supports all funnel event names', () => {
    const sink = vi.fn();
    setAnalyticsSink(sink);

    const events = [
      'install',
      'avatar_complete',
      'add_to_cart',
      'checkout',
      'wait_complete',
      'reveal_opened',
      'reveal_rated',
      'unlock',
      'share',
    ] as const;

    for (const name of events) {
      trackEvent(name);
    }

    expect(sink).toHaveBeenCalledTimes(events.length);
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/react-native';

import {
  captureClosetException,
  captureSmokeEvent,
  initSentry,
  resetSentryForTests,
} from './sentry';

/** A fresh copy of the module (and of the @sentry/react-native mock), so each test starts uninitialized. */
async function loadSentry() {
  vi.resetModules();
  const Sentry = await import('@sentry/react-native');
  const wrapper = await import('./sentry');
  return { Sentry: vi.mocked(Sentry), ...wrapper };
}

describe('sentry', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does nothing without EXPO_PUBLIC_SENTRY_DSN', async () => {
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', '');
    const { Sentry, initSentry, captureException } = await loadSentry();

    initSentry();
    captureException(new Error('boom'));

    expect(Sentry.init).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('initializes once with the DSN and forwards errors', async () => {
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', 'https://key@o0.ingest.sentry.io/1');
    const { Sentry, initSentry, captureException } = await loadSentry();

    initSentry();
    initSentry();
    const error = new Error('boom');
    captureException(error);

    expect(Sentry.init).toHaveBeenCalledOnce();
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://key@o0.ingest.sentry.io/1' }),
    );
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(error);
  });
});

describe('mobile sentry', () => {
  // The suite above shares these spies; start each test with no recorded calls.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetSentryForTests();
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    delete process.env.EXPO_PUBLIC_SENTRY_SMOKE;
    vi.mocked(Sentry.init).mockClear();
    vi.mocked(Sentry.captureException).mockClear();
    vi.mocked(Sentry.captureMessage).mockClear();
  });

  it('no-ops without DSN', () => {
    initSentry();
    expect(Sentry.init).not.toHaveBeenCalled();
    captureClosetException(new Error('x'), { screen: 'Vault' });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('inits with closet surface tag and reports screen errors', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';
    initSentry();
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        initialScope: { tags: { worn_surface: 'closet' } },
      }),
    );
    captureClosetException(new Error('load failed'), { screen: 'Vault' });
    expect(Sentry.withScope).toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('captures preview smoke when DSN present', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';
    process.env.EXPO_PUBLIC_SENTRY_SMOKE = '1';
    initSentry();
    expect(Sentry.captureMessage).toHaveBeenCalledWith('worn.smoke.closet', 'info');
    expect(captureSmokeEvent()).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

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

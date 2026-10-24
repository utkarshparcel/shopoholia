import * as Sentry from '@sentry/react-native';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { initSentry } from '@/src/lib/sentry';

import { RootErrorBoundary } from './RootErrorBoundary';

describe('RootErrorBoundary', () => {
  beforeAll(() => {
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', 'https://key@o0.ingest.sentry.io/1');
    initSentry();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
  });

  it('reports the render error to Sentry once', () => {
    const error = new Error("Cannot read properties of undefined (reading 'items')");
    const retry = vi.fn(async () => undefined);

    const { rerender } = render(<RootErrorBoundary error={error} retry={retry} />);
    rerender(<RootErrorBoundary error={error} retry={retry} />);

    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(error);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText(error.message)).toBeTruthy();
  });

  it('retries when the user taps Try again', () => {
    const retry = vi.fn(async () => undefined);
    render(<RootErrorBoundary error={new Error('boom')} retry={retry} />);

    fireEvent.click(screen.getByRole('button'));

    expect(retry).toHaveBeenCalledOnce();
  });

  it('keeps error details out of release builds', () => {
    const globals = globalThis as { __DEV__?: boolean };
    globals.__DEV__ = false;
    try {
      render(<RootErrorBoundary error={new Error('secret internals')} retry={vi.fn()} />);
      expect(screen.queryByText('secret internals')).toBeNull();
      expect(screen.getByText(/Try again, or restart the app/)).toBeTruthy();
    } finally {
      globals.__DEV__ = true;
    }
  });
});

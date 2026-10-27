import { describe, expect, it } from 'vitest';

import { ApiRequestError } from './client';
import { createAppQueryClient, shouldRetryQuery } from './queryClient';

describe('shouldRetryQuery', () => {
  it('retries timeouts, network failures and server errors twice', () => {
    for (const error of [
      new ApiRequestError(0, 'slow', 'timeout'),
      new ApiRequestError(503, 'down'),
      new TypeError('Network request failed'),
    ]) {
      expect(shouldRetryQuery(0, error)).toBe(true);
      expect(shouldRetryQuery(1, error)).toBe(true);
      expect(shouldRetryQuery(2, error)).toBe(false);
    }
  });

  it('never retries a refusal or a build with no server address', () => {
    expect(shouldRetryQuery(0, new ApiRequestError(401, 'no'))).toBe(false);
    expect(shouldRetryQuery(0, new ApiRequestError(404, 'gone'))).toBe(false);
    expect(shouldRetryQuery(0, new ApiRequestError(0, 'none', 'no_api_url'))).toBe(false);
  });
});

describe('createAppQueryClient', () => {
  it('applies the closet stale times and keeps saved domains for a day', () => {
    const qc = createAppQueryClient();
    expect(qc.getQueryDefaults(['ingestion-status', 'u'])).toMatchObject({ staleTime: 15_000 });
    expect(qc.getQueryDefaults(['wardrobe', 'u', null, 30])).toMatchObject({
      staleTime: 120_000,
      gcTime: 24 * 60 * 60_000,
    });
    expect(qc.getQueryDefaults(['gift-cards', 'u'])).not.toHaveProperty('gcTime');
  });
});

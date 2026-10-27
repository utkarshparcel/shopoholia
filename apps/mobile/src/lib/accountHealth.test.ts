import { describe, expect, it } from 'vitest';

import { mapAccountHealth, toAccountHealthRow } from './accountHealth';

describe('mapAccountHealth status mapping', () => {
  it('maps statuses to tones and reconnect flags', () => {
    expect(
      mapAccountHealth({
        status: 'IDLE',
        lastSyncAt: '2026-08-26T08:00:00.000Z',
        hasToken: true,
      }).tone,
    ).toBe('ok');
    expect(
      mapAccountHealth({
        status: 'SYNCING',
        lastSyncAt: null,
        hasToken: true,
      }).tone,
    ).toBe('syncing');
    expect(
      mapAccountHealth({
        status: 'PAUSED',
        lastSyncAt: null,
        hasToken: true,
      }).tone,
    ).toBe('paused');
    expect(
      mapAccountHealth({
        status: 'ERROR',
        lastSyncAt: null,
        hasToken: false,
        meta: { lastError: 'Token revoked', errorCode: 'TOKEN_REVOKED' },
      }),
    ).toMatchObject({
      tone: 'needs_reconnect',
      needsReconnect: true,
      error: 'Token revoked',
    });
  });
});

describe('toAccountHealthRow', () => {
  it('adds lastSyncLabel and prefers API health payload', () => {
    const now = Date.parse('2026-08-26T12:00:00.000Z');
    const row = toAccountHealthRow(
      {
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'EMAIL',
        provider: 'gmail',
        status: 'ERROR',
        lastSyncAt: '2026-08-26T08:00:00.000Z',
        hasToken: false,
        health: {
          tone: 'needs_reconnect',
          label: 'Reconnect needed',
          status: 'ERROR',
          lastSyncAt: '2026-08-26T08:00:00.000Z',
          error: 'Disconnected — reconnect to resume sync',
          needsReconnect: true,
          hasToken: false,
        },
      },
      now,
    );
    expect(row.lastSyncLabel).toBe('4h ago');
    expect(row.needsReconnect).toBe(true);
    expect(row.error).toMatch(/Disconnected/);
  });
});

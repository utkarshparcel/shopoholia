import { describe, expect, it } from 'vitest';

import {
  buildConsentCenterList,
  formatLastSync,
  hasLiveEmailConnection,
} from './consentCenter';

describe('formatLastSync', () => {
  const now = Date.parse('2026-08-26T12:00:00.000Z');

  it('labels never / just now / relative windows', () => {
    expect(formatLastSync(null, now)).toBe('Never synced');
    expect(formatLastSync('2026-08-26T11:59:30.000Z', now)).toBe('Just now');
    expect(formatLastSync('2026-08-26T11:30:00.000Z', now)).toBe('30m ago');
    expect(formatLastSync('2026-08-26T06:00:00.000Z', now)).toBe('6h ago');
    expect(formatLastSync('2026-08-24T12:00:00.000Z', now)).toBe('2d ago');
  });
});

describe('buildConsentCenterList', () => {
  const now = Date.parse('2026-08-26T12:00:00.000Z');

  it('lists all scopes with active grants and connected sources by last sync', () => {
    const list = buildConsentCenterList(
      [
        {
          scope: 'EMAIL',
          grantedAt: '2026-08-20T10:00:00.000Z',
          revokedAt: null,
        },
        {
          scope: 'FINANCIAL',
          grantedAt: '2026-08-21T10:00:00.000Z',
          revokedAt: null,
        },
        {
          scope: 'SMS',
          grantedAt: '2026-08-01T10:00:00.000Z',
          revokedAt: '2026-08-10T10:00:00.000Z',
        },
      ],
      [
        {
          id: '11111111-1111-4111-8111-111111111111',
          kind: 'EMAIL',
          provider: 'gmail',
          status: 'IDLE',
          lastSyncAt: '2026-08-26T08:00:00.000Z',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          kind: 'SMS',
          provider: 'android',
          status: 'PAUSED',
          lastSyncAt: null,
        },
      ],
      now,
    );

    expect(list.scopes).toEqual([
      {
        kind: 'scope',
        scope: 'EMAIL',
        grantedAt: '2026-08-20T10:00:00.000Z',
        active: true,
      },
      { kind: 'scope', scope: 'SMS', grantedAt: null, active: false },
      {
        kind: 'scope',
        scope: 'FINANCIAL',
        grantedAt: '2026-08-21T10:00:00.000Z',
        active: true,
      },
      { kind: 'scope', scope: 'LIKENESS', grantedAt: null, active: false },
      { kind: 'scope', scope: 'CONCIERGE', grantedAt: null, active: false },
    ]);

    expect(list.sources).toHaveLength(2);
    expect(list.sources[0]?.provider).toBe('gmail');
    expect(list.sources[0]?.lastSyncLabel).toBe('4h ago');
    expect(list.sources[1]?.lastSyncLabel).toBe('Never synced');
    expect(hasLiveEmailConnection(list)).toBe(true);
  });

  it('hasLiveEmailConnection is false when email paused or grant missing', () => {
    const paused = buildConsentCenterList(
      [{ scope: 'EMAIL', grantedAt: '2026-08-20T10:00:00.000Z' }],
      [
        {
          id: '11111111-1111-4111-8111-111111111111',
          kind: 'EMAIL',
          provider: 'gmail',
          status: 'PAUSED',
          lastSyncAt: '2026-08-26T08:00:00.000Z',
        },
      ],
      now,
    );
    expect(hasLiveEmailConnection(paused)).toBe(false);

    const noGrant = buildConsentCenterList(
      [],
      [
        {
          id: '11111111-1111-4111-8111-111111111111',
          kind: 'EMAIL',
          provider: 'gmail',
          status: 'IDLE',
          lastSyncAt: null,
        },
      ],
      now,
    );
    expect(hasLiveEmailConnection(noGrant)).toBe(false);
  });
});

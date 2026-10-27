import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useConsentSources,
  useConsents,
  useDisconnectSource,
  useGrantConsent,
  useRevokeConsent,
} from './useConsent';
import {
  disconnectIngestionSource,
  fetchConsents,
  fetchIngestionSources,
  grantConsent,
  revokeConsent,
} from '@/src/api/client';

vi.mock('@/src/stores/session', () => ({
  useSessionStore: (selector: (s: { accessToken: string | null }) => unknown) =>
    selector({ accessToken: 'test-token' }),
}));

vi.mock('@/src/api/client', () => ({
  fetchConsents: vi.fn(async () => ({
    grants: [
      {
        id: 'g1',
        userId: 'u1',
        scope: 'EMAIL',
        grantedAt: '2026-01-01T00:00:00.000Z',
        revokedAt: null,
        source: 'consent-center',
        meta: null,
      },
      {
        id: 'g2',
        userId: 'u1',
        scope: 'SMS',
        grantedAt: '2026-01-01T00:00:00.000Z',
        revokedAt: null,
        source: 'consent-center',
        meta: null,
      },
    ],
  })),
  fetchIngestionSources: vi.fn(async () => ({
    sources: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        kind: 'EMAIL',
        provider: 'gmail',
        consentGrantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        status: 'IDLE',
        cursor: null,
        lastSyncAt: null,
      },
    ],
  })),
  grantConsent: vi.fn(async () => ({
    id: 'g3',
    userId: 'u1',
    scope: 'FINANCIAL',
    grantedAt: '2026-08-26T00:00:00.000Z',
    revokedAt: null,
    source: 'consent-center',
    meta: null,
  })),
  revokeConsent: vi.fn(async () => undefined),
  disconnectIngestionSource: vi.fn(async () => undefined),
}));

function ConsentsProbe() {
  const { data, isLoading } = useConsents();
  if (isLoading) return <span>loading</span>;
  return <span>scopes:{data?.grants.map((g) => g.scope).join(',')}</span>;
}

function SourcesProbe() {
  const { data, isLoading } = useConsentSources();
  if (isLoading) return <span>loading-sources</span>;
  return (
    <span>
      sources:{data?.sources.map((s) => `${s.provider}:${s.status}`).join(',')}
    </span>
  );
}

function RevokeProbe() {
  const revoke = useRevokeConsent();
  return (
    <button type="button" onClick={() => revoke.mutate('EMAIL')}>
      {revoke.isSuccess ? 'revoked' : 'revoke'}
    </button>
  );
}

function GrantProbe() {
  const grant = useGrantConsent();
  return (
    <button
      type="button"
      onClick={() => grant.mutate({ scope: 'FINANCIAL' })}
    >
      {grant.isSuccess ? 'granted' : 'grant'}
    </button>
  );
}

function DisconnectProbe() {
  const disconnect = useDisconnectSource();
  return (
    <button
      type="button"
      onClick={() => disconnect.mutate('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')}
    >
      {disconnect.isSuccess ? 'disconnected' : 'disconnect'}
    </button>
  );
}

describe('useConsent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads live consent grants', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ConsentsProbe />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('scopes:EMAIL,SMS')).toBeTruthy();
    });
    expect(fetchConsents).toHaveBeenCalledWith('test-token');
  });

  it('lists connected ingestion sources', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SourcesProbe />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('sources:gmail:IDLE')).toBeTruthy();
    });
    expect(fetchIngestionSources).toHaveBeenCalledWith('test-token');
  });

  it('grants consent via API with default source', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    render(
      <QueryClientProvider client={client}>
        <GrantProbe />
      </QueryClientProvider>,
    );
    await act(async () => {
      screen.getByText('grant').click();
    });
    await waitFor(() => {
      expect(screen.getByText('granted')).toBeTruthy();
    });
    expect(grantConsent).toHaveBeenCalledWith('test-token', 'FINANCIAL', 'consent-center');
    expect(invalidateSpy.mock.calls.some((c) => (c[0] as { queryKey?: unknown[] })?.queryKey?.[0] === 'vault-consents')).toBe(true);
  });

  it('revokes consent via API', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <RevokeProbe />
      </QueryClientProvider>,
    );
    await act(async () => {
      screen.getByText('revoke').click();
    });
    await waitFor(() => {
      expect(screen.getByText('revoked')).toBeTruthy();
    });
    expect(revokeConsent).toHaveBeenCalledWith('test-token', 'EMAIL');
  });

  it('disconnects a source via API', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DisconnectProbe />
      </QueryClientProvider>,
    );
    await act(async () => {
      screen.getByText('disconnect').click();
    });
    await waitFor(() => {
      expect(screen.getByText('disconnected')).toBeTruthy();
    });
    expect(disconnectIngestionSource).toHaveBeenCalledWith(
      'test-token',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
  });
});

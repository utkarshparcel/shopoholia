import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  useIngestionMetrics,
  useIngestionSources,
  useIngestionStatus,
} from './useIngestion';
import { fetchIngestionMetrics, fetchIngestionSources } from '@/src/api/client';

vi.mock('@/src/stores/session', () => ({
  useSessionStore: (selector: (s: { accessToken: string | null }) => unknown) =>
    selector({ accessToken: 'test-token' }),
}));

vi.mock('@/src/api/client', () => ({
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
      {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        kind: 'EMAIL',
        provider: 'gmail',
        consentGrantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        status: 'ERROR',
        cursor: null,
        lastSyncAt: null,
      },
    ],
  })),
  fetchIngestionMetrics: vi.fn(async () => ({
    totalMessages: 10,
    specificHits: 7,
    genericHits: 2,
    misses: 1,
    coverage: 0.9,
    byStatus: {},
    byKind: { EMAIL: 10 },
    byMerchant: { amazon: 5 },
    costEstimate: { perMessageMinor: 1, estimatedTotalMinor: 10, currency: 'INR' },
    note: 'ok',
  })),
}));

function StatusProbe() {
  const { data, isLoading } = useIngestionStatus();
  if (isLoading) return <span>loading</span>;
  return (
    <span data-testid="status">
      {data?.connected ? 'connected' : 'disconnected'}:{data?.sourceCount ?? 0}:
      {data ? Math.round(data.coverage * 100) : 0}
    </span>
  );
}

function SourcesProbe() {
  const { data, isLoading, isSuccess } = useIngestionSources();
  if (isLoading) return <span>loading-sources</span>;
  return (
    <span data-testid="sources">
      {isSuccess ? `ok-sources:${data.sources.length}` : 'sources-fail'}
    </span>
  );
}

function MetricsProbe() {
  const { data, isLoading, isSuccess, error } = useIngestionMetrics();
  if (isLoading) return <span>loading-metrics</span>;
  return (
    <span data-testid="metrics">
      {isSuccess ? `ok-msgs:${data.totalMessages}` : `metrics-fail:${String(error)}`}
    </span>
  );
}

describe('useIngestionStatus', () => {
  it('reports connected when non-ERROR sources exist', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <StatusProbe />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('connected:1:90');
    });
  });
});

describe('useIngestionSources / useIngestionMetrics', () => {
  it('loads sources and metrics independently', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <SourcesProbe />
        <MetricsProbe />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('sources').textContent).toBe('ok-sources:2');
      expect(screen.getByTestId('metrics').textContent).toBe('ok-msgs:10');
    });
    expect(fetchIngestionSources).toHaveBeenCalled();
    expect(fetchIngestionMetrics).toHaveBeenCalled();
  });
});

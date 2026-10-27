import { queryOptions, useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  fetchIngestionMetrics,
  fetchIngestionSources,
  type IngestionMetrics,
  type IngestionSource,
} from '@/src/api/client';

import { closetKey, sessionToken, useClosetSubscribed, useSessionUserId } from './keys';

/**
 * Ingestion dashboard hooks: GET /ingestion/sources and GET /ingestion/metrics.
 * Every view of ingestion (status, the dashboard, useCloset) reads these two queries, so the
 * data is fetched once and one invalidation refreshes all of them. Re-exported from useCloset.ts.
 */
export function ingestionSourcesQuery(userId: string | null) {
  return queryOptions({
    queryKey: closetKey('ingestion-sources', userId),
    queryFn: ({ signal }) => fetchIngestionSources(sessionToken(), signal),
    enabled: Boolean(userId),
  });
}

export function ingestionMetricsQuery(userId: string | null) {
  return queryOptions({
    queryKey: closetKey('ingestion-metrics', userId),
    queryFn: ({ signal }) => fetchIngestionMetrics(sessionToken(), signal),
    enabled: Boolean(userId),
  });
}

export function useIngestionSources() {
  return useQuery({ ...ingestionSourcesQuery(useSessionUserId()), subscribed: useClosetSubscribed() });
}

export function useIngestionMetrics() {
  return useQuery({ ...ingestionMetricsQuery(useSessionUserId()), subscribed: useClosetSubscribed() });
}

type SourcesData = { sources: IngestionSource[] };

/** Both queries as one result: data once both have loaded, loading/refetching while either is. */
function combineIngestion<T>(
  [sources, metrics]: [UseQueryResult<SourcesData>, UseQueryResult<IngestionMetrics>],
  derive: (sources: SourcesData, metrics: IngestionMetrics) => T,
) {
  return {
    data: sources.data && metrics.data ? derive(sources.data, metrics.data) : undefined,
    isLoading: sources.isLoading || metrics.isLoading,
    isError: sources.isError || metrics.isError,
    error: sources.error ?? metrics.error,
    isRefetching: sources.isRefetching || metrics.isRefetching,
    refetch: () => Promise.all([sources.refetch(), metrics.refetch()]),
  };
}

function statusFrom({ sources }: SourcesData, metrics: IngestionMetrics) {
  const working = sources.filter((s) => s.status !== 'ERROR');
  return {
    connected: working.length > 0,
    sourceCount: working.length,
    coverage: metrics.coverage,
    totalMessages: metrics.totalMessages,
    byKind: metrics.byKind,
    byMerchant: metrics.byMerchant,
  };
}

function closetFrom({ sources }: SourcesData, metrics: IngestionMetrics) {
  return {
    sources,
    metrics,
    connected: sources.length > 0,
    coverage: metrics.coverage,
  };
}

const combineStatus = (
  results: [UseQueryResult<SourcesData>, UseQueryResult<IngestionMetrics>],
) => combineIngestion(results, statusFrom);

const combineCloset = (
  results: [UseQueryResult<SourcesData>, UseQueryResult<IngestionMetrics>],
) => combineIngestion(results, closetFrom);

/** Connected sources (a source in ERROR doesn't count) and coverage, for the status chips. */
export function useIngestionStatus() {
  const userId = useSessionUserId();
  return useQueries({
    queries: [ingestionSourcesQuery(userId), ingestionMetricsQuery(userId)],
    combine: combineStatus,
    subscribed: useClosetSubscribed(),
  });
}

/** The Closet overview: every source plus the metrics. */
export function useCloset() {
  const userId = useSessionUserId();
  return useQueries({
    queries: [ingestionSourcesQuery(userId), ingestionMetricsQuery(userId)],
    combine: combineCloset,
  });
}

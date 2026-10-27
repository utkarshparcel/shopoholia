import { useQuery } from '@tanstack/react-query';
import {
  fetchIngestionMetrics,
  fetchIngestionSources,
} from '@/src/api/client';
import { useSessionStore } from '@/src/stores/session';

/**
 * Ingestion dashboard hooks — thin wrappers around GET /ingestion/sources
 * and GET /ingestion/metrics. Separated from useCloset.ts for import
 * ergonomics; re-exported there as well.
 */
export function useIngestionSources() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['ingestion-sources', accessToken],
    queryFn: () => fetchIngestionSources(accessToken!),
    enabled: Boolean(accessToken),
  });
}

export function useIngestionMetrics() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['ingestion-metrics', accessToken],
    queryFn: () => fetchIngestionMetrics(accessToken!),
    enabled: Boolean(accessToken),
  });
}

export function useIngestionStatus() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['ingestion-status', accessToken],
    queryFn: async () => {
      const [sourcesRes, metricsRes] = await Promise.all([
        fetchIngestionSources(accessToken!),
        fetchIngestionMetrics(accessToken!),
      ]);
      return {
        connected: sourcesRes.sources.some((s) => s.status !== 'ERROR'),
        sourceCount: sourcesRes.sources.filter((s) => s.status !== 'ERROR').length,
        coverage: metricsRes.coverage,
        totalMessages: metricsRes.totalMessages,
        byKind: metricsRes.byKind,
        byMerchant: metricsRes.byMerchant,
      };
    },
    enabled: Boolean(accessToken),
  });
}

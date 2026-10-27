import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  disconnectIngestionSource,
  fetchConsents,
  fetchIngestionSources,
  grantConsent,
  revokeConsent,
} from '@/src/api/client';
import { useSessionStore } from '@/src/stores/session';

export function useConsents() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['vault-consents', accessToken],
    queryFn: () => fetchConsents(accessToken!),
    enabled: Boolean(accessToken),
  });
}

export function useConsentSources() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['ingestion-sources', accessToken],
    queryFn: () => fetchIngestionSources(accessToken!),
    enabled: Boolean(accessToken),
  });
}

export function useGrantConsent() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ scope, source }: { scope: string; source?: string }) =>
      grantConsent(accessToken!, scope, source ?? 'consent-center'),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['vault-consents'] });
    },
  });
}

export function useRevokeConsent() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (scope: string) => {
      await revokeConsent(accessToken!, scope);
      if (scope === 'EMAIL') {
        const { sources } = await fetchIngestionSources(accessToken!);
        await Promise.all(
          sources
            .filter((s) => s.kind === 'EMAIL' && s.status !== 'ERROR')
            .map((s) => disconnectIngestionSource(accessToken!, s.id).catch(() => undefined)),
        );
      }
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['vault-consents'] });
      void client.invalidateQueries({ queryKey: ['ingestion-sources'] });
      void client.invalidateQueries({ queryKey: ['ingestion-status'] });
    },
  });
}

export function useDisconnectSource() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) => disconnectIngestionSource(accessToken!, sourceId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['ingestion-sources'] });
      void client.invalidateQueries({ queryKey: ['ingestion-status'] });
    },
  });
}

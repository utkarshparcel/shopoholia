import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  ApiRequestError,
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
    // The key holds the token, which renews every 15 minutes: keep the known grants meanwhile,
    // so the queries gated on them (useConsentGate) don't pause on every renewal.
    placeholderData: keepPreviousData,
  });
}

export type ConsentGate = {
  /**
   * Whether queries behind this scope may run: the scope is granted, or the grants couldn't be
   * read (then the server decides, as before). False while the grants are still loading.
   */
  allowed: boolean;
  /**
   * The API's own "missing consent" 403, when the grants are known and this scope isn't among
   * them. Screens show it where they showed that request's error, so the consent prompt stays.
   */
  missingError: ApiRequestError | null;
};

/**
 * Gate for queries the API refuses (403) without a consent scope, so they don't fire — and fail —
 * until the user has granted it. Granting or revoking invalidates the grants, which reopens or
 * closes the gate.
 */
export function useConsentGate(scope: string): ConsentGate {
  const consents = useConsents();
  const grants = consents.data?.grants;
  const granted = grants?.some((g) => g.scope === scope && !g.revokedAt) ?? false;
  const known = grants !== undefined;
  const unreadable = !known && consents.isError;
  return useMemo(
    () => ({
      allowed: granted || unreadable,
      missingError:
        known && !granted
          ? new ApiRequestError(403, `Missing active consent for scope: ${scope}`, 'consent_required')
          : null,
    }),
    [granted, known, unreadable, scope],
  );
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

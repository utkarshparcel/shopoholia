/**
 * Connected accounts health (N49) — thin Closet view-model over shared mapping.
 */

import { mapAccountHealth, type AccountHealth } from '@worn/shared';

import { formatLastSync } from './consentCenter';

export type { AccountHealth };
export { mapAccountHealth };

export type AccountHealthRow = AccountHealth & {
  id: string;
  provider: string;
  sourceKind: string;
  lastSyncLabel: string;
};

export function toAccountHealthRow(
  source: {
    id: string;
    kind: string;
    provider: string;
    status: string;
    lastSyncAt: string | null;
    hasToken?: boolean;
    meta?: Record<string, unknown> | null;
    /** API may widen tone/status to string via JSON; mapAccountHealth re-derives if absent. */
    health?: AccountHealth | (Omit<AccountHealth, 'tone' | 'status'> & { tone: string; status: string });
  },
  now = Date.now(),
): AccountHealthRow {
  const health =
    source.health &&
    (source.health.tone === 'ok' ||
      source.health.tone === 'syncing' ||
      source.health.tone === 'paused' ||
      source.health.tone === 'error' ||
      source.health.tone === 'needs_reconnect')
      ? (source.health as AccountHealth)
      : mapAccountHealth({
          status: source.status,
          lastSyncAt: source.lastSyncAt,
          hasToken: source.hasToken ?? source.status !== 'ERROR',
          meta: source.meta ?? null,
        });
  return {
    ...health,
    id: source.id,
    provider: source.provider,
    sourceKind: source.kind,
    lastSyncLabel: formatLastSync(health.lastSyncAt, now),
  };
}

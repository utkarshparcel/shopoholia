/**
 * Consent center view-model helpers.
 *
 * Pure merge of live consent grants + connected ingestion sources so the
 * mobile Consent screen (and tests) share one shape: scopes to revoke,
 * sources with last sync, disconnect targets.
 */

import { formatRelativeTime } from './format';

export type ConsentGrantLike = {
  scope: string;
  grantedAt: string;
  revokedAt?: string | null;
};

export type IngestionSourceLike = {
  id: string;
  kind: string;
  provider: string;
  status: string;
  lastSyncAt: string | null;
};

export type ConsentScopeRow = {
  kind: 'scope';
  scope: string;
  grantedAt: string | null;
  active: boolean;
};

export type ConnectedSourceRow = {
  kind: 'source';
  id: string;
  sourceKind: string;
  provider: string;
  status: string;
  lastSyncAt: string | null;
  /** Human label for last sync (or "Never synced"). */
  lastSyncLabel: string;
};

export type ConsentCenterList = {
  scopes: ConsentScopeRow[];
  sources: ConnectedSourceRow[];
};

export const CONSENT_SCOPES = ['EMAIL', 'SMS', 'FINANCIAL', 'LIKENESS', 'CONCIERGE'] as const;

export type ConsentScopeId = (typeof CONSENT_SCOPES)[number];

/** W073 — plain-English cards for trust scopes (revoke stays one tap). */
export type ConsentPlainCard = {
  scope: ConsentScopeId;
  title: string;
  summary: string;
  detail: string;
};

export const CONSENT_PLAIN_CARDS: Record<ConsentScopeId, ConsentPlainCard> = {
  EMAIL: {
    scope: 'EMAIL',
    title: 'Email receipts',
    summary: 'Read purchase and shipping emails only.',
    detail:
      'We scan order and delivery messages for gift cards, store credit, returns, and warranties — never personal mail or messages you send.',
  },
  SMS: {
    scope: 'SMS',
    title: 'Order texts',
    summary: 'Scan purchase and shipping texts on this device.',
    detail:
      'Optional. We look for merchant order alerts and OTPs tied to deliveries — not your whole message history.',
  },
  FINANCIAL: {
    scope: 'FINANCIAL',
    title: 'Money in your Vault',
    summary: 'Track balances, refunds, and spend you already paid for.',
    detail:
      'Keeps gift cards, store credit, and refunds accurate in your private Vault. Not a bank login or wallet.',
  },
  LIKENESS: {
    scope: 'LIKENESS',
    title: 'Your look (try-on)',
    summary: 'Use your photo for private outfit previews.',
    detail: 'Stays in your account for try-on. Never used for ads or sold.',
  },
  CONCIERGE: {
    scope: 'CONCIERGE',
    title: 'Concierge help',
    summary: 'Let support act on returns and claims with you.',
    detail: 'Only when you ask. You can revoke anytime.',
  },
};

/** Primary trust scopes shown as plain-language cards (W073). */
export const CONSENT_TRUST_SCOPES: readonly ConsentScopeId[] = ['EMAIL', 'SMS', 'FINANCIAL'];

export function getConsentPlainCard(scope: string): ConsentPlainCard | null {
  if ((CONSENT_SCOPES as readonly string[]).includes(scope)) {
    return CONSENT_PLAIN_CARDS[scope as ConsentScopeId];
  }
  return null;
}

export function formatLastSync(
  lastSyncAt: string | null,
  now = Date.now(),
): string {
  if (!lastSyncAt) return 'Never synced';
  const t = Date.parse(lastSyncAt);
  if (!Number.isFinite(t)) return 'Never synced';
  return formatRelativeTime(lastSyncAt, now);
}

export function buildConsentCenterList(
  grants: ConsentGrantLike[],
  sources: IngestionSourceLike[],
  now = Date.now(),
): ConsentCenterList {
  const activeByScope = new Map<string, ConsentGrantLike>();
  for (const g of grants) {
    if (g.revokedAt) continue;
    const prev = activeByScope.get(g.scope);
    if (!prev || Date.parse(g.grantedAt) >= Date.parse(prev.grantedAt)) {
      activeByScope.set(g.scope, g);
    }
  }

  const scopes: ConsentScopeRow[] = CONSENT_SCOPES.map((scope) => {
    const g = activeByScope.get(scope);
    return {
      kind: 'scope',
      scope,
      grantedAt: g?.grantedAt ?? null,
      active: Boolean(g),
    };
  });

  const sourceRows: ConnectedSourceRow[] = sources.map((s) => ({
    kind: 'source',
    id: s.id,
    sourceKind: s.kind,
    provider: s.provider,
    status: s.status,
    lastSyncAt: s.lastSyncAt,
    lastSyncLabel: formatLastSync(s.lastSyncAt, now),
  }));

  // Most recently synced first; never-synced last.
  sourceRows.sort((a, b) => {
    const aT = a.lastSyncAt ? Date.parse(a.lastSyncAt) : 0;
    const bT = b.lastSyncAt ? Date.parse(b.lastSyncAt) : 0;
    return bT - aT;
  });

  return { scopes, sources: sourceRows };
}

/** True when EMAIL consent is active and at least one email source is not paused. */
export function hasLiveEmailConnection(list: ConsentCenterList): boolean {
  const emailGranted = list.scopes.some((s) => s.scope === 'EMAIL' && s.active);
  if (!emailGranted) return false;
  return list.sources.some(
    (s) => s.sourceKind === 'EMAIL' && s.status !== 'PAUSED' && s.status !== 'REVOKED',
  );
}

/**
 * U044 — Last sync scope diff: scopes used + doc counts (no bodies).
 */

export type ConsentScopeId = "EMAIL" | "SMS" | "FINANCIAL" | "LIKENESS" | "CONCIERGE";

export type ScopeChip = {
  scope: ConsentScopeId;
  /** Whether this scope was active / used for the last sync window. */
  used: boolean;
  docCount: number;
  label: string;
};

export type LastSyncScopeDiff = {
  lastSyncAt: string | null;
  scopes: ScopeChip[];
  totalDocs: number;
  /** Privacy note — never includes bodies. */
  note: string;
};

const SCOPE_LABEL: Record<ConsentScopeId, string> = {
  EMAIL: "Email",
  SMS: "SMS",
  FINANCIAL: "Financial",
  LIKENESS: "Likeness",
  CONCIERGE: "Concierge",
};

const KIND_TO_SCOPE: Record<string, ConsentScopeId> = {
  EMAIL: "EMAIL",
  SMS: "SMS",
  RECEIPT: "EMAIL", // receipt uploads share email-consent path for ingest
};

/**
 * Build last-sync transparency chips from sources + docs + active consents.
 * Counts only docs at/after lastSyncAt (or all docs if no sync yet — then counts=0).
 */
export function computeLastSyncScopeDiff(input: {
  sources: Array<{
    kind: string;
    lastSyncAt: Date | string | null;
    status?: string;
  }>;
  documents: Array<{
    kind: string;
    createdAt: Date | string;
  }>;
  activeScopes: string[];
  now?: Date;
}): LastSyncScopeDiff {
  const active = new Set(input.activeScopes.map((s) => s.toUpperCase()));
  let lastSyncMs = 0;
  let lastSyncAt: string | null = null;
  for (const s of input.sources) {
    if (!s.lastSyncAt) continue;
    const ms = new Date(s.lastSyncAt).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms >= lastSyncMs) {
      lastSyncMs = ms;
      lastSyncAt = new Date(ms).toISOString();
    }
  }

  const counts: Record<ConsentScopeId, number> = {
    EMAIL: 0,
    SMS: 0,
    FINANCIAL: 0,
    LIKENESS: 0,
    CONCIERGE: 0,
  };

  let totalDocs = 0;
  if (lastSyncMs > 0) {
    for (const d of input.documents) {
      const created = new Date(d.createdAt).getTime();
      if (Number.isNaN(created) || created < lastSyncMs) continue;
      const scope = KIND_TO_SCOPE[d.kind];
      if (!scope) continue;
      counts[scope] += 1;
      totalDocs += 1;
    }
  }

  // FINANCIAL / LIKENESS / CONCIERGE don't produce ingest docs — mark used only if active.
  const scopes: ScopeChip[] = (
    Object.keys(SCOPE_LABEL) as ConsentScopeId[]
  ).map((scope) => {
    const docCount = counts[scope];
    const used =
      scope === "EMAIL" || scope === "SMS"
        ? active.has(scope) && (docCount > 0 || Boolean(lastSyncAt && active.has(scope)))
        : active.has(scope);
    return {
      scope,
      used: Boolean(used && active.has(scope)),
      docCount,
      label: SCOPE_LABEL[scope],
    };
  });

  // Refine EMAIL/SMS used: active + (had a source of that kind with last sync)
  for (const chip of scopes) {
    if (chip.scope !== "EMAIL" && chip.scope !== "SMS") continue;
    const hadSourceSync = input.sources.some(
      (s) =>
        s.kind === chip.scope &&
        s.lastSyncAt != null &&
        !Number.isNaN(new Date(s.lastSyncAt).getTime()),
    );
    chip.used = active.has(chip.scope) && (hadSourceSync || chip.docCount > 0);
  }

  return {
    lastSyncAt,
    scopes,
    totalDocs,
    note: "Counts only — no message bodies or tokens.",
  };
}

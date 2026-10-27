/**
 * U043 — Mute sender / subject pattern rules with preview + 7d undo.
 * Extends N47 merchant mute with pattern rules on source meta.
 */

export type MuteRuleType = "merchant" | "sender" | "subject";

export type MuteRule = {
  id: string;
  type: MuteRuleType;
  /** Merchant name, sender email/number, or subject substring (case-insensitive). */
  pattern: string;
  mutedAt: string;
  /** Docs that would stop matching this rule at mute time. */
  previewCount: number;
};

export type MutePreviewMatch = {
  documentId: string;
  kind: string;
  merchant: string | null;
  subject: string | null;
  from: string | null;
};

const UNDO_MS = 7 * 24 * 60 * 60 * 1000;

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `mute-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeMutePattern(pattern: string): string {
  return pattern.trim().toLowerCase();
}

export function muteRulesFromMeta(
  meta: Record<string, unknown> | null | undefined,
): MuteRule[] {
  if (!meta || typeof meta !== "object") return [];
  const raw = meta.muteRules;
  if (!Array.isArray(raw)) return [];
  const out: MuteRule[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const type = r.type;
    const pattern = typeof r.pattern === "string" ? r.pattern : "";
    if (
      (type !== "merchant" && type !== "sender" && type !== "subject") ||
      !pattern.trim()
    ) {
      continue;
    }
    out.push({
      id: typeof r.id === "string" ? r.id : randomId(),
      type,
      pattern: pattern.trim(),
      mutedAt:
        typeof r.mutedAt === "string" ? r.mutedAt : new Date().toISOString(),
      previewCount:
        typeof r.previewCount === "number" ? Math.max(0, Math.trunc(r.previewCount)) : 0,
    });
  }
  return out;
}

export function writeMuteRulesToMeta(
  meta: Record<string, unknown> | null | undefined,
  rules: MuteRule[],
): Record<string, unknown> {
  return {
    ...(meta ?? {}),
    muteRules: rules,
  };
}

function docFields(parsed: Record<string, unknown> | null | undefined): {
  merchant: string | null;
  subject: string | null;
  from: string | null;
} {
  const pj = parsed ?? {};
  return {
    merchant: typeof pj.merchant === "string" ? pj.merchant : null,
    subject: typeof pj.subject === "string" ? pj.subject : null,
    from:
      typeof pj.from === "string"
        ? pj.from
        : typeof pj.sender === "string"
          ? pj.sender
          : null,
  };
}

export function matchesMuteRule(
  rule: Pick<MuteRule, "type" | "pattern">,
  doc: {
    parsedJson?: Record<string, unknown> | null;
    merchant?: string | null;
  },
): boolean {
  const fields = docFields(doc.parsedJson ?? null);
  const merchant = doc.merchant ?? fields.merchant;
  const pat = normalizeMutePattern(rule.pattern);
  if (!pat) return false;
  if (rule.type === "merchant") {
    return Boolean(merchant && normalizeMutePattern(merchant).includes(pat));
  }
  if (rule.type === "sender") {
    return Boolean(fields.from && normalizeMutePattern(fields.from).includes(pat));
  }
  return Boolean(fields.subject && normalizeMutePattern(fields.subject).includes(pat));
}

/** Preview which docs would stop ingesting for this rule. */
export function previewMuteRule(
  rule: Pick<MuteRule, "type" | "pattern">,
  docs: Array<{
    id: string;
    kind: string;
    parsedJson?: Record<string, unknown> | null;
  }>,
): { count: number; matches: MutePreviewMatch[] } {
  const matches: MutePreviewMatch[] = [];
  for (const d of docs) {
    if (!matchesMuteRule(rule, d)) continue;
    const fields = docFields(d.parsedJson ?? null);
    matches.push({
      documentId: d.id,
      kind: d.kind,
      merchant: fields.merchant,
      subject: fields.subject,
      from: fields.from,
    });
  }
  return { count: matches.length, matches };
}

export function createMuteRule(input: {
  type: MuteRuleType;
  pattern: string;
  previewCount: number;
  now?: Date;
}): MuteRule {
  return {
    id: randomId(),
    type: input.type,
    pattern: input.pattern.trim(),
    mutedAt: (input.now ?? new Date()).toISOString(),
    previewCount: Math.max(0, input.previewCount),
  };
}

/** Undo allowed within 7 days of mutedAt. */
export function canUndoMuteRule(
  rule: Pick<MuteRule, "mutedAt">,
  now: Date = new Date(),
): boolean {
  const muted = Date.parse(rule.mutedAt);
  if (Number.isNaN(muted)) return false;
  return now.getTime() - muted <= UNDO_MS;
}

export function removeMuteRule(
  rules: MuteRule[],
  ruleId: string,
  now: Date = new Date(),
): { rules: MuteRule[]; removed: MuteRule | null; error?: "not_found" | "undo_expired" } {
  const idx = rules.findIndex((r) => r.id === ruleId);
  if (idx < 0) return { rules, removed: null, error: "not_found" };
  const target = rules[idx]!;
  if (!canUndoMuteRule(target, now)) {
    return { rules, removed: null, error: "undo_expired" };
  }
  const next = rules.filter((r) => r.id !== ruleId);
  return { rules: next, removed: target };
}

/** True when any mute rule (or legacy mutedMerchants) would block this doc. */
export function isMutedByRules(
  doc: { parsedJson?: Record<string, unknown> | null; merchant?: string | null },
  rules: MuteRule[],
  legacyMutedMerchants: string[] = [],
): boolean {
  if (rules.some((r) => matchesMuteRule(r, doc))) return true;
  const merchant = doc.merchant ?? docFields(doc.parsedJson).merchant;
  if (!merchant) return false;
  const key = merchant.trim().toUpperCase();
  return legacyMutedMerchants.some((m) => m.trim().toUpperCase() === key);
}

export const MUTE_UNDO_DAYS = 7;

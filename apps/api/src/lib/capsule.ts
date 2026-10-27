/**
 * N32 — Capsule builder: user picks an N-item core set;
 * outfit generator prefers membership when building looks.
 */

export const DEFAULT_CAPSULE_MAX = 12;
export const CAPSULE_CONSENT_KEY = "capsuleItemIds";
/** Score boost applied to capsule members during ranking. */
export const CAPSULE_SCORE_BOOST = 25;

/** Dedupe + cap to N ids (stable order). */
export function normalizeCapsuleItemIds(
  itemIds: string[],
  maxN: number = DEFAULT_CAPSULE_MAX,
): string[] {
  const n = Math.max(1, Math.min(50, Math.floor(maxN)));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of itemIds) {
    if (typeof id !== "string" || !id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= n) break;
  }
  return out;
}

export function isCapsuleMember(
  itemId: string,
  capsuleIds: Iterable<string>,
): boolean {
  const set = capsuleIds instanceof Set ? capsuleIds : new Set(capsuleIds);
  return set.has(itemId);
}

/** Read capsule ids from user consentFlags jsonb. */
export function readCapsuleItemIds(
  consentFlags: Record<string, unknown> | null | undefined,
): string[] {
  const raw = consentFlags?.[CAPSULE_CONSENT_KEY];
  if (!Array.isArray(raw)) return [];
  return normalizeCapsuleItemIds(
    raw.filter((x): x is string => typeof x === "string"),
  );
}

/** Merge capsule ids into consentFlags without clobbering other keys. */
export function withCapsuleInConsent(
  consentFlags: Record<string, unknown> | null | undefined,
  itemIds: string[],
  maxN: number = DEFAULT_CAPSULE_MAX,
): Record<string, unknown> {
  return {
    ...(consentFlags ?? {}),
    [CAPSULE_CONSENT_KEY]: normalizeCapsuleItemIds(itemIds, maxN),
  };
}

/**
 * When the pool has enough capsule members, restrict to them so weekly
 * planning stays inside the capsule. Falls back to full pool otherwise.
 */
export function preferCapsulePool<T extends { id: string }>(
  pool: T[],
  capsuleIds: Iterable<string>,
  minCount = 1,
): { pool: T[]; restricted: boolean; memberCount: number } {
  const set = capsuleIds instanceof Set ? capsuleIds : new Set(capsuleIds);
  if (set.size === 0 || pool.length === 0) {
    return { pool, restricted: false, memberCount: 0 };
  }
  const members = pool.filter((it) => set.has(it.id));
  if (members.length >= minCount) {
    return { pool: members, restricted: true, memberCount: members.length };
  }
  return { pool, restricted: false, memberCount: members.length };
}

type ScoredLike = { item: { id: string }; score: number };

/**
 * Boost capsule membership in a ranked list and re-sort (score desc).
 * Used when the generator keeps the full wardrobe but still prefers capsule.
 */
export function applyCapsulePreference<T extends ScoredLike>(
  scored: T[],
  capsuleIds: Iterable<string>,
  boost: number = CAPSULE_SCORE_BOOST,
): { scored: T[]; preferredCount: number; whyHint: string | null } {
  const set = capsuleIds instanceof Set ? capsuleIds : new Set(capsuleIds);
  if (set.size === 0) {
    return { scored, preferredCount: 0, whyHint: null };
  }
  let preferredCount = 0;
  const next = scored.map((s) => {
    if (!set.has(s.item.id)) return s;
    preferredCount += 1;
    return { ...s, score: s.score + boost };
  });
  next.sort((a, b) => b.score - a.score);
  return {
    scored: next,
    preferredCount,
    whyHint:
      preferredCount > 0
        ? `Preferred ${preferredCount} piece(s) from your capsule`
        : null,
  };
}

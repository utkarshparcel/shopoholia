/**
 * W067 — shoe/bag rotation nudge card copy from GET /wardrobe/rotation.
 */

export type ShoeBagRotationLike = {
  id: string;
  category: string;
  brand: string | null;
  kind: 'shoes' | 'bag';
  wearCount: number;
  reason: string;
};

export type ShoeBagNudgeCard = {
  id: string;
  kind: 'shoes' | 'bag';
  headline: string;
  body: string;
  ctaLabel: string;
};

export function buildShoeBagNudgeCard(s: ShoeBagRotationLike): ShoeBagNudgeCard {
  const label = s.brand ? `${s.brand} · ${s.category}` : s.category;
  const kindLabel = s.kind === 'bag' ? 'bag' : 'shoes';
  return {
    id: s.id,
    kind: s.kind,
    headline: `Rotate your ${kindLabel}`,
    body: `${label} — ${s.reason}`,
    ctaLabel: 'Log a wear',
  };
}

export function shoeBagNudgeCardsFromSuggestions(
  suggestions: ShoeBagRotationLike[],
  limit = 4,
): ShoeBagNudgeCard[] {
  return suggestions.slice(0, limit).map(buildShoeBagNudgeCard);
}

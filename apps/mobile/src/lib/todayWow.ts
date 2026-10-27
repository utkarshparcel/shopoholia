/**
 * W043–W050 — Today outfit wow helpers (pure + Reduce Motion–safe).
 * Closet Today surface only — no Play blend.
 */

/** Deep link / push → focus outfit + optional reveal (W043). */
export const TODAY_OUTFIT_HREF = {
  pathname: '/(closet)/today' as const,
  params: { focus: 'outfit' as const },
};

export function isMorningOutfitDeepLink(input: {
  focus?: string | null;
  reveal?: string | null;
  url?: string | null;
}): boolean {
  const focus = (input.focus ?? '').trim().toLowerCase();
  if (focus === 'outfit' || focus === 'reveal' || focus === '7am') return true;
  if ((input.reveal ?? '').trim() === '1') return true;

  const url = (input.url ?? '').trim();
  if (!url) return false;
  // bare worn://today or path ending in /today (optional query)
  const pathOnly = url.split('?')[0] ?? url;
  if (!/worn:\/\/today\/?$/i.test(pathOnly) && !/\/today\/?$/i.test(pathOnly)) {
    return false;
  }
  const focusMatch = url.match(/[?&]focus=([^&]+)/i);
  if (!focusMatch) return true;
  const qFocus = decodeURIComponent(focusMatch[1] ?? '').toLowerCase();
  return qFocus === 'outfit' || qFocus === 'reveal' || qFocus === '7am' || qFocus === '';
}

/** W043 — short reveal motion unless Reduce Motion is on. */
export function shouldAnimateAvatarReveal(reduceMotion: boolean): boolean {
  return !reduceMotion;
}

export const AVATAR_REVEAL_MS = 520;

/** W044 — clamp alt index for Prev/Next; null = no move. */
export function nextAltIndex(
  current: number,
  delta: 1 | -1,
  opts: { hasMore: boolean },
): number | null {
  const next = current + delta;
  if (next < 0) return null;
  if (delta > 0 && !opts.hasMore) return null;
  return next;
}

/** W044 — slide direction for alt swap (+1 = next look enters from right). */
export function altSwipeOffset(delta: 1 | -1, width = 28): number {
  return delta * width;
}

/** W044 — skip slide animation under Reduce Motion. */
export function shouldAnimateAltSwipe(reduceMotion: boolean): boolean {
  return !reduceMotion;
}

/** W045 — weather re-roll banner copy. */
export function weatherRerollBannerCopy(): { title: string; cta: string } {
  return {
    title: 'Weather shifted — we refreshed today’s look',
    cta: 'Use this look',
  };
}

/** W047 — chips when generator excluded recently worn pieces. */
const AVOID_REPEAT_RE =
  /worn in the last|skipped \d+ piece\(s\) worn|avoid.?repeat|recently worn/i;

export function isAvoidRepeatWhyLine(line: string): boolean {
  return AVOID_REPEAT_RE.test(line);
}

export function avoidRepeatChips(
  whyThis: string[],
): Array<{ id: string; label: string }> {
  const chips: Array<{ id: string; label: string }> = [];
  whyThis.forEach((line, i) => {
    if (!isAvoidRepeatWhyLine(line)) return;
    const label = line
      .replace(/^Skipped\s+/i, 'Skipped ')
      .replace(/\.$/, '')
      .trim();
    chips.push({ id: `avoid-${i}`, label: label.length > 56 ? `${label.slice(0, 53)}…` : label });
  });
  return chips;
}

/** W048 — merge a goes-with match into today’s item list (try on today). */
export function mergeGoesWithIntoOutfit(
  currentIds: string[],
  anchorId: string,
  matchId: string,
  maxItems = 4,
): string[] {
  const base = currentIds.filter(Boolean);
  if (!base.includes(anchorId)) {
    return [...new Set([anchorId, matchId, ...base])].slice(0, maxItems);
  }
  if (base.includes(matchId)) return base.slice(0, maxItems);
  // Prefer keeping anchor; drop a non-anchor slot if at capacity.
  if (base.length < maxItems) return [...base, matchId];
  const withoutOther = base.filter((id) => id === anchorId || id === matchId);
  const fillers = base.filter((id) => id !== anchorId && id !== matchId);
  return [...withoutOther, matchId, ...fillers].filter(
    (id, i, arr) => arr.indexOf(id) === i,
  ).slice(0, maxItems);
}

/** W049 — calendar import success toast. */
export function calendarImportSuccessCopy(res: {
  events: Array<{
    outfit?: unknown | null;
    reminderScheduled?: boolean;
    remindAt?: string | null;
  }>;
}): { title: string; body: string } {
  const planned = res.events.filter((e) => Boolean(e.outfit)).length;
  const n = planned > 0 ? planned : res.events.length;
  const nightBefore = res.events.some(
    (e) => e.reminderScheduled === true || Boolean(e.remindAt),
  );
  const title =
    n === 1 ? '1 outfit planned' : `${n} outfits planned`;
  const body = nightBefore
    ? 'Night-before reminder is on when the event is tomorrow.'
    : 'Looks are on your week strip.';
  return { title, body };
}

/** W050 — generator starvation when every piece is dirty / in laundry. */
export function laundryStarvationPrompt(
  items: Array<{ laundryStatus?: string | null }>,
): {
  dirtyCount: number;
  title: string;
  message: string;
  markCleanCta: string;
  wearAnywayCta: string;
} | null {
  if (items.length === 0) return null;
  const dirty = items.filter((i) => {
    const s = (i.laundryStatus ?? 'CLEAN').toUpperCase();
    return s === 'DIRTY' || s === 'IN_LAUNDRY';
  });
  if (dirty.length < items.length) return null;
  return {
    dirtyCount: dirty.length,
    title: 'Everything’s in the laundry',
    message:
      dirty.length === 1
        ? 'Mark it clean to unlock better looks, or wear it anyway.'
        : `All ${dirty.length} pieces are dirty or at the cleaner. Mark clean or wear anyway.`,
    markCleanCta: 'Mark clean',
    wearAnywayCta: 'Wear anyway',
  };
}

/** Dirty / in-laundry item ids for bulk mark-clean (W050). */
export function dirtyWardrobeItemIds(
  items: Array<{ id: string; laundryStatus?: string | null }>,
): string[] {
  return items
    .filter((i) => {
      const s = (i.laundryStatus ?? 'CLEAN').toUpperCase();
      return s === 'DIRTY' || s === 'IN_LAUNDRY';
    })
    .map((i) => i.id);
}

/**
 * W046 — PATCH payload to assign the viewing look onto a week day
 * (long-press / drag-plan on the week strip).
 */
export function weekDayAssignPayload(
  date: string,
  outfit: { itemIds: string[]; occasion?: string | null },
): { date: string; itemIds: string[]; occasion: string | null } {
  return {
    date,
    itemIds: [...outfit.itemIds],
    occasion: outfit.occasion ?? null,
  };
}

/** W046 — hint under the week strip. */
export function weekStripPlanHint(): string {
  return 'Tap a day to view · long-press to assign this look';
}

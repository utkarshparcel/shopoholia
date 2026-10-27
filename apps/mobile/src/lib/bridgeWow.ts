/**
 * W083–W088 — Play⇄Closet bridge polish helpers (Closet-framed only; no blended screens).
 */

import { formatMinor, normalizeMerchantKey } from '@worn/shared';

/** W083 — success sheet after Track Play buy (idempotent created vs already). */
export function trackBuySuccessCopy(input: {
  created: boolean;
  itemCount?: number;
  wardrobeCount?: number;
}): { title: string; body: string; vaultLabel: string; wardrobeLabel: string } {
  const wardrobeCount = input.wardrobeCount ?? input.itemCount ?? 0;
  if (input.created) {
    return {
      title: 'Saved to Closet',
      body:
        wardrobeCount > 0
          ? `Purchase tracked and ${wardrobeCount} wardrobe piece${wardrobeCount === 1 ? '' : 's'} seeded.`
          : 'Purchase tracked in Closet.',
      vaultLabel: 'Open Vault',
      wardrobeLabel: 'Open wardrobe',
    };
  }
  return {
    title: 'Already in Closet',
    body: 'This Play buy was already tracked — safe to tap again anytime.',
    vaultLabel: 'Open Vault',
    wardrobeLabel: 'Open wardrobe',
  };
}

export const TRACK_BUY_VAULT_HREF = '/(closet)/vault' as const;
export const TRACK_BUY_WARDROBE_HREF = '/(closet)/wardrobe' as const;

/** W084 — readable pre-buy fit panel lines (soft only; never blocks). */
export type PrebuyOverlapLike = {
  candidateTitle: string;
  wardrobeLabel: string;
  score: number;
};

export type PrebuyGapLike = {
  budgetCategory: string;
  message: string;
};

export type PrebuyBudgetLike = {
  exceeded: boolean;
  category: string;
  message: string;
};

export function prebuyFitPanelSections(input: {
  score: number;
  summary: string;
  overlaps: PrebuyOverlapLike[];
  gaps: PrebuyGapLike[];
  budgetNudges: PrebuyBudgetLike[];
}): {
  scoreLabel: string;
  summary: string;
  softNote: string;
  overlapLines: string[];
  gapLines: string[];
  budgetLines: string[];
} {
  const exceeded = input.budgetNudges.filter((n) => n.exceeded);
  return {
    scoreLabel: `Fit score ${input.score}/100`,
    summary: input.summary,
    softNote: 'Soft check only — checkout stays open.',
    overlapLines: input.overlaps.slice(0, 3).map(
      (o) => `Overlap · ${o.candidateTitle} ≈ ${o.wardrobeLabel} (${o.score})`,
    ),
    gapLines: input.gaps.slice(0, 3).map((g) => `Gap · ${g.message}`),
    budgetLines: exceeded.slice(0, 2).map((n) => `Budget · ${n.message}`),
  };
}

/** W085 — soft banner footer (never blocks). */
export const BUDGET_NUDGE_SOFT_FOOTER =
  'Just a heads-up — you can still check out whenever you like.';

/** U047 — Closet soft gate labels (Continue / Cut spend; never hard-block). */
export function closetBudgetSoftGateCopy(input: {
  exceeded: boolean;
  category?: string | null;
  message?: string | null;
}): {
  softBlock: boolean;
  title: string;
  body: string;
  continueLabel: string;
  cutSpendLabel: string;
  cutSpendHref: '/(closet)/accountant';
  hardBlock: false;
} | null {
  if (!input.exceeded) return null;
  const category = input.category?.trim() || 'this';
  return {
    softBlock: true,
    title: 'Over budget this period',
    body:
      input.message?.trim() ||
      `This Play haul would push your ${category} budget over the limit. Continue anyway, or cut spend in Closet.`,
    continueLabel: 'Continue',
    cutSpendLabel: 'Cut spend',
    cutSpendHref: '/(closet)/accountant',
    hardBlock: false,
  };
}

/** W086 — twin sheet row labels. */
export type TwinCandidateLike = {
  listingId: string;
  title: string;
  score: number;
  affiliateUrl: string | null;
  platform: string;
};

export function replaceTwinSheetRows(
  candidates: TwinCandidateLike[],
  limit = 8,
): Array<TwinCandidateLike & { ctaLabel: string; shoppable: boolean }> {
  return candidates.slice(0, limit).map((c) => ({
    ...c,
    shoppable: Boolean(c.affiliateUrl),
    ctaLabel: c.affiliateUrl ? `Shop twin · ${c.platform}` : 'No link yet',
  }));
}

/** W087 — explicit Waste → Play try-on CTA (no blended screen). */
export const WASTE_RESTYLE_CTA_LABEL = 'See it restyled';
export const WASTE_RESTYLE_PLAY_HREF = '/(tabs)/feed' as const;

export function wasteRestyleCta(): {
  label: string;
  href: typeof WASTE_RESTYLE_PLAY_HREF;
  hint: string;
} {
  return {
    label: WASTE_RESTYLE_CTA_LABEL,
    href: WASTE_RESTYLE_PLAY_HREF,
    hint: 'Opens Play try-on — Closet stays separate.',
  };
}

/** W088 — soft “pay with store credit?” when vault merchant matches cart titles. */
export type CreditAccountLike = {
  kind: string;
  merchant: string;
  status: string;
  balanceCacheMinor: number;
  currency?: string;
};

const CREDIT_KINDS = new Set(['STORE_CREDIT', 'GIFT_CARD', 'PROMO_CREDIT']);

export function matchStoreCreditHint(
  accounts: CreditAccountLike[],
  cartTitles: string[],
): {
  merchant: string;
  balanceMinor: number;
  amountLabel: string;
  message: string;
  softNote: string;
  vaultHref: typeof TRACK_BUY_VAULT_HREF;
} | null {
  const haystack = cartTitles.map((t) => normalizeMerchantKey(t)).join(' ');
  const usable = accounts.filter(
    (a) =>
      CREDIT_KINDS.has(a.kind) &&
      a.status === 'ACTIVE' &&
      a.balanceCacheMinor > 0,
  );
  if (usable.length === 0) return null;

  const matched =
    usable.find((a) => {
      const key = normalizeMerchantKey(a.merchant);
      return key.length >= 3 && haystack.includes(key);
    }) ?? null;
  if (!matched) return null;

  const amountLabel = formatMinor(matched.balanceCacheMinor, matched.currency ?? 'INR');
  return {
    merchant: matched.merchant,
    balanceMinor: matched.balanceCacheMinor,
    amountLabel,
    message: `Pay with store credit? You still have ${amountLabel} at ${matched.merchant}.`,
    softNote: 'Hint only — we never auto-charge vault credit at checkout.',
    vaultHref: TRACK_BUY_VAULT_HREF,
  };
}

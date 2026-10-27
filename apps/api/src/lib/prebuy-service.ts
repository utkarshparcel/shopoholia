import type { Repositories } from "./repositories/types.js";
import { isBudgetExceeded } from "./budget.js";
import {
  computePrebuyFit,
  resolveCandidatePriceMinor,
  type PrebuyCandidate,
  type PrebuyFitResult,
} from "./prebuy-fit.js";
import { pickPrimaryBudgetNudge, type BudgetNudgePayload } from "./budget.js";

export type CartPrebuyContext = {
  fit: PrebuyFitResult;
  primaryBudgetNudge: BudgetNudgePayload | null;
};

/**
 * Build candidates from the user's Play cart and run closet pre-buy fit.
 */
export async function evaluateCartPrebuyFit(
  repos: Repositories,
  userId: string,
  overrides?: PrebuyCandidate[],
): Promise<CartPrebuyContext> {
  let candidates = overrides ?? [];
  if (!overrides) {
    const cart = await repos.getOrCreateCart(userId);
    const rows = await repos.getCartItems(cart.id);
    if (rows.length === 0) {
      const empty = computePrebuyFit([], [], []);
      return { fit: empty, primaryBudgetNudge: null };
    }
    const variantIds = rows.map((r) => r.listingVariantId);
    const variants = await repos.findVariantsByIds(variantIds);
    const variantMap = new Map(variants.map((v) => [v.id, v]));
    const listingIds = [...new Set(variants.map((v) => v.listingId))];
    const listings = await repos.findListingsByIds(listingIds);
    const listingMap = new Map(listings.map((l) => [l.id, l]));

    candidates = [];
    for (const row of rows) {
      const variant = variantMap.get(row.listingVariantId);
      const listing = variant ? listingMap.get(variant.listingId) : null;
      if (!listing) continue;
      candidates.push({
        title: listing.title,
        category: listing.category,
        brand: null,
        priceMinor: resolveCandidatePriceMinor({
          realPrice: listing.realPrice,
          coinPrice: row.coinPriceSnapshot,
          qty: 1,
        }),
        qty: row.quantity,
        listingId: listing.id,
      });
    }
  }

  const wardrobe = await repos.listWardrobeItems(userId);
  const budgets = await repos.listBudgets(userId);
  const budgetContexts = await Promise.all(
    budgets.map(async (b) => {
      const status = await isBudgetExceeded(repos, userId, b.category);
      return {
        category: b.category,
        period: b.period,
        limitMinor: b.limitMinor,
        actualMinor: status.actualMinor,
      };
    }),
  );

  const fit = computePrebuyFit(
    candidates,
    wardrobe.map((w) => ({
      id: w.id,
      category: w.category,
      brand: w.brand,
      label: [w.brand, w.category].filter(Boolean).join(" "),
    })),
    budgetContexts,
  );

  const primaryBudgetNudge = pickPrimaryBudgetNudge(
    fit.budgetNudges.map((n) => ({
      exceeded: n.exceeded,
      category: n.category,
      limitMinor: n.limitMinor,
      actualMinor: n.actualMinor,
      proposedMinor: n.proposedMinor,
      projectedMinor: n.projectedMinor,
      message: n.message,
    })),
  );

  return { fit, primaryBudgetNudge };
}

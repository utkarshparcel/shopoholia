/* eslint-disable @typescript-eslint/no-explicit-any */
import { computeRewearStreak, type RewearStreak } from "@worn/shared";

/** Load wear_log (+ optional purchases) and compute N53 rewear streak. */
export async function loadRewearStreak(
  app: any,
  userId: string,
  opts?: { breakOnPurchase?: boolean },
): Promise<RewearStreak> {
  const wearLogs = (await app.deps.repos.listWearLogs?.(userId)) ?? [];
  const breakOnPurchase = Boolean(opts?.breakOnPurchase);
  let purchaseDates: Date[] = [];
  if (breakOnPurchase) {
    const purchases =
      (await app.deps.repos.listMerchantPurchases?.(userId)) ??
      (await app.deps.repos.listMerchantPurchasesByUser?.(userId)) ??
      [];
    purchaseDates = purchases.map((p: { purchasedAt: Date }) => p.purchasedAt);
  }
  return computeRewearStreak({
    wearDates: wearLogs.map((w: { wornOn: Date }) => w.wornOn),
    purchaseDates,
    breakOnPurchase,
  });
}

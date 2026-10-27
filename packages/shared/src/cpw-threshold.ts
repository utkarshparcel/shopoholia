/**
 * U036 — alert when cost-per-wear is above a user threshold.
 */

export type CpwThresholdPrefs = {
  /** Max acceptable CPW in minor units; null = alerts off. */
  maxCpwMinor: number | null;
};

export const DEFAULT_CPW_THRESHOLD: CpwThresholdPrefs = {
  maxCpwMinor: null,
};

export function normalizeCpwThreshold(
  raw: Partial<CpwThresholdPrefs> | null | undefined,
): CpwThresholdPrefs {
  if (raw?.maxCpwMinor == null) return { maxCpwMinor: null };
  if (typeof raw.maxCpwMinor !== "number" || raw.maxCpwMinor <= 0) {
    return { maxCpwMinor: null };
  }
  return { maxCpwMinor: Math.floor(raw.maxCpwMinor) };
}

export type CpwThresholdAlert = {
  wardrobeItemId: string;
  category: string;
  costPerWearMinor: number;
  thresholdMinor: number;
  headline: string;
  body: string;
  disposeDeepLink: string;
  wearChallengeDeepLink: string;
};

export function cpwAboveThresholdAlert(opts: {
  wardrobeItemId: string;
  category?: string | null;
  costPerWearMinor: number | null | undefined;
  thresholdMinor: number | null | undefined;
}): CpwThresholdAlert | null {
  const threshold = opts.thresholdMinor;
  const cpw = opts.costPerWearMinor;
  if (threshold == null || threshold <= 0) return null;
  if (cpw == null || cpw <= threshold) return null;
  const cat = (opts.category ?? "item").trim() || "item";
  return {
    wardrobeItemId: opts.wardrobeItemId,
    category: cat,
    costPerWearMinor: cpw,
    thresholdMinor: threshold,
    headline: "Cost-per-wear is high",
    body: `${cat} CPW is above your threshold — wear more or dispose.`,
    disposeDeepLink: `worn://disposition?itemId=${opts.wardrobeItemId}`,
    wearChallengeDeepLink: `worn://wardrobe?itemId=${opts.wardrobeItemId}&challenge=1`,
  };
}

export function collectCpwThresholdAlerts(
  items: Array<{
    wardrobeItemId: string;
    category?: string | null;
    costPerWearMinor?: number | null;
  }>,
  thresholdMinor: number | null | undefined,
): CpwThresholdAlert[] {
  const out: CpwThresholdAlert[] = [];
  for (const it of items) {
    const alert = cpwAboveThresholdAlert({
      wardrobeItemId: it.wardrobeItemId,
      category: it.category,
      costPerWearMinor: it.costPerWearMinor,
      thresholdMinor,
    });
    if (alert) out.push(alert);
  }
  return out;
}

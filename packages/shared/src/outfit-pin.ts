/**
 * U033 — pin outfit to calendar day (survives re-roll).
 * Pin flag lives on outfit.weatherCtx.pinned.
 */

export type OutfitPinCtx = {
  pinned?: boolean;
  pinConflict?: boolean;
  [key: string]: unknown;
};

export function isOutfitPinned(
  weatherCtx: Record<string, unknown> | null | undefined,
): boolean {
  return Boolean(weatherCtx && (weatherCtx as OutfitPinCtx).pinned === true);
}

export function withOutfitPinned(
  weatherCtx: Record<string, unknown> | null | undefined,
  pinned: boolean,
): Record<string, unknown> {
  return { ...(weatherCtx ?? {}), pinned };
}

export type PinConflictWarn = {
  warn: boolean;
  message: string;
  date: string;
};

/** Warn when regenerate would overwrite a pinned day. */
export function pinConflictWarn(
  date: string,
  weatherCtx: Record<string, unknown> | null | undefined,
  force = false,
): PinConflictWarn | null {
  if (!isOutfitPinned(weatherCtx)) return null;
  if (force) return null;
  return {
    warn: true,
    date,
    message: `Pinned outfit for ${date} — unpin or confirm to overwrite.`,
  };
}

/** Whether week generate should skip this day. */
export function shouldSkipPinnedOnReroll(
  weatherCtx: Record<string, unknown> | null | undefined,
  opts?: { force?: boolean; replacePinned?: boolean },
): boolean {
  if (opts?.force || opts?.replacePinned) return false;
  return isOutfitPinned(weatherCtx);
}

/**
 * U031 — batch “wore these” for multi-piece outfit + 10-minute undo.
 */

export const WEAR_LOG_UNDO_WINDOW_MS = 10 * 60_000;

export type WearBatchPiece = {
  id: string;
  label: string;
  kind: "garment" | "accessory";
};

/** Pieces shown on the confirm sheet before POST /wear with outfitId. */
export function wearBatchConfirmPieces(
  items: Array<{ id: string; category?: string | null; brand?: string | null }>,
): WearBatchPiece[] {
  return items.map((it) => {
    const cat = (it.category ?? "item").trim() || "item";
    const brand = (it.brand ?? "").trim();
    const label = brand ? `${brand} ${cat}` : cat;
    const lower = cat.toLowerCase();
    const kind: WearBatchPiece["kind"] =
      /belt|bag|scarf|jewel|watch|hat|sunglass|accessor/.test(lower)
        ? "accessory"
        : "garment";
    return { id: it.id, label, kind };
  });
}

export function wearBatchConfirmCopy(pieces: WearBatchPiece[]): {
  title: string;
  body: string;
  pieceCount: number;
} {
  const n = pieces.length;
  return {
    title: n <= 1 ? "Log this wear?" : `Log all ${n} pieces?`,
    body:
      n === 0
        ? "No pieces on this outfit."
        : pieces.map((p) => p.label).join(" · "),
    pieceCount: n,
  };
}

/** True when a wear log createdAt is still inside the undo window. */
export function canUndoWearLog(
  createdAt: Date | string,
  now: Date = new Date(),
  windowMs: number = WEAR_LOG_UNDO_WINDOW_MS,
): boolean {
  const t = typeof createdAt === "string" ? Date.parse(createdAt) : createdAt.getTime();
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t <= windowMs;
}

/**
 * U029 — Seller return label / QR for pickup agent.
 */

export type ReturnLabelState = {
  imageKey: string | null;
  usedAt: string | null;
  /** True when a label image exists and has not been marked used. */
  readyForAgent: boolean;
};

export function returnLabelState(input: {
  labelImageKey?: string | null;
  labelUsedAt?: string | Date | null;
}): ReturnLabelState {
  const imageKey = input.labelImageKey?.trim() || null;
  const usedAt =
    input.labelUsedAt == null
      ? null
      : input.labelUsedAt instanceof Date
        ? input.labelUsedAt.toISOString()
        : String(input.labelUsedAt);
  return {
    imageKey,
    usedAt,
    readyForAgent: Boolean(imageKey) && !usedAt,
  };
}

export function returnLabelOfflineHint(readyForAgent: boolean): string {
  return readyForAgent
    ? "Show this label to the pickup agent — works offline once loaded."
    : "Upload or generate a return label before pickup.";
}

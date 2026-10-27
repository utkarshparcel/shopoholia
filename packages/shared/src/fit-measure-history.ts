/**
 * U037 — measurement update with history + “what changed” note.
 */

export type MeasurePoints = Record<string, number>;

export type MeasureDiff = {
  key: string;
  from: number | null;
  to: number | null;
};

export function diffMeasurePoints(
  previous: MeasurePoints | null | undefined,
  next: MeasurePoints,
): MeasureDiff[] {
  const keys = new Set([
    ...Object.keys(previous ?? {}),
    ...Object.keys(next),
  ]);
  const diffs: MeasureDiff[] = [];
  for (const key of [...keys].sort()) {
    if (key.startsWith("__")) continue;
    const from = previous?.[key];
    const to = next[key];
    const fromN = typeof from === "number" ? from : null;
    const toN = typeof to === "number" ? to : null;
    if (fromN === toN) continue;
    diffs.push({ key, from: fromN, to: toN });
  }
  return diffs;
}

export function whatChangedNote(
  diffs: MeasureDiff[],
  userNote?: string | null,
): string {
  const note = (userNote ?? "").trim();
  if (diffs.length === 0) {
    return note || "No numeric changes";
  }
  const parts = diffs.map((d) => {
    if (d.from == null) return `${d.key}→${d.to}`;
    if (d.to == null) return `${d.key} cleared`;
    return `${d.key} ${d.from}→${d.to}`;
  });
  const auto = parts.join(", ");
  return note ? `${note} (${auto})` : auto;
}

/** Prefer newest profile by updatedAt/createdAt for reorder. */
export function latestMeasurement<T extends { updatedAt: string | Date; createdAt?: string | Date }>(
  profiles: T[],
): T | null {
  if (profiles.length === 0) return null;
  return [...profiles].sort((a, b) => {
    const ta = new Date(a.updatedAt).getTime();
    const tb = new Date(b.updatedAt).getTime();
    return tb - ta;
  })[0]!;
}

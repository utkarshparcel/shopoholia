/**
 * U040 — photo-dump triage: keep / wardrobe / discard + undo.
 */

export const PHOTO_DUMP_TAG = "photo-dump";
export const PHOTO_DUMP_TRIAGE_KEEP = "triage-keep";
export const PHOTO_DUMP_TRIAGE_WARDROBE = "triage-wardrobe";
export const PHOTO_DUMP_TRIAGE_DISCARD = "triage-discard";
export const PHOTO_DUMP_REVIEWED_TAG = "photo-dump-reviewed";

export type PhotoDumpTriageDecision = "keep" | "wardrobe" | "discard";

export const PHOTO_DUMP_TRIAGE_UNDO_WINDOW_MS = 10 * 60_000;

const DECISION_TAGS: Record<PhotoDumpTriageDecision, string> = {
  keep: PHOTO_DUMP_TRIAGE_KEEP,
  wardrobe: PHOTO_DUMP_TRIAGE_WARDROBE,
  discard: PHOTO_DUMP_TRIAGE_DISCARD,
};

export function triageDecisionFromTags(
  tags: string[] | null | undefined,
): PhotoDumpTriageDecision | null {
  const t = tags ?? [];
  if (t.includes(PHOTO_DUMP_TRIAGE_KEEP)) return "keep";
  if (t.includes(PHOTO_DUMP_TRIAGE_WARDROBE)) return "wardrobe";
  if (t.includes(PHOTO_DUMP_TRIAGE_DISCARD)) return "discard";
  return null;
}

export function applyPhotoDumpTriageTags(
  existing: string[] | null | undefined,
  decision: PhotoDumpTriageDecision,
): string[] {
  const strip = new Set([
    PHOTO_DUMP_TRIAGE_KEEP,
    PHOTO_DUMP_TRIAGE_WARDROBE,
    PHOTO_DUMP_TRIAGE_DISCARD,
    PHOTO_DUMP_REVIEWED_TAG,
    "sorted",
  ]);
  const base = [...(existing ?? [])].filter((x) => !strip.has(x));
  if (!base.includes(PHOTO_DUMP_TAG)) base.unshift(PHOTO_DUMP_TAG);
  base.push(DECISION_TAGS[decision], PHOTO_DUMP_REVIEWED_TAG, "sorted");
  return base;
}

/** Undo triage → back to pending dump review. */
export function undoPhotoDumpTriageTags(
  existing: string[] | null | undefined,
): string[] {
  const strip = new Set([
    PHOTO_DUMP_TRIAGE_KEEP,
    PHOTO_DUMP_TRIAGE_WARDROBE,
    PHOTO_DUMP_TRIAGE_DISCARD,
    PHOTO_DUMP_REVIEWED_TAG,
    "sorted",
  ]);
  const base = [...(existing ?? [])].filter((x) => !strip.has(x));
  if (!base.includes(PHOTO_DUMP_TAG)) base.unshift(PHOTO_DUMP_TAG);
  return base;
}

export function isPhotoDumpTriagePending(tags: string[] | null | undefined): boolean {
  const t = tags ?? [];
  return t.includes(PHOTO_DUMP_TAG) && triageDecisionFromTags(t) == null;
}

export type PhotoDumpTriageProgress = {
  total: number;
  pending: number;
  decided: number;
  keep: number;
  wardrobe: number;
  discard: number;
  label: string;
  ratio: number;
};

export function photoDumpTriageProgress(
  items: Array<{ tags?: string[] | null }>,
): PhotoDumpTriageProgress {
  const dump = items.filter((i) => (i.tags ?? []).includes(PHOTO_DUMP_TAG));
  let keep = 0;
  let wardrobe = 0;
  let discard = 0;
  let pending = 0;
  for (const i of dump) {
    const d = triageDecisionFromTags(i.tags);
    if (d === "keep") keep += 1;
    else if (d === "wardrobe") wardrobe += 1;
    else if (d === "discard") discard += 1;
    else pending += 1;
  }
  const total = dump.length;
  const decided = total - pending;
  const ratio = total === 0 ? 0 : decided / total;
  return {
    total,
    pending,
    decided,
    keep,
    wardrobe,
    discard,
    ratio,
    label:
      total === 0
        ? "No photo-dump batch yet"
        : pending === 0
          ? `All ${total} triaged · ${keep} keep · ${wardrobe} wardrobe · ${discard} discard`
          : `${decided} of ${total} triaged · ${pending} left`,
  };
}

export function canUndoPhotoDumpTriage(
  decidedAt: Date | string,
  now: Date = new Date(),
  windowMs: number = PHOTO_DUMP_TRIAGE_UNDO_WINDOW_MS,
): boolean {
  const t = typeof decidedAt === "string" ? Date.parse(decidedAt) : decidedAt.getTime();
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t <= windowMs;
}

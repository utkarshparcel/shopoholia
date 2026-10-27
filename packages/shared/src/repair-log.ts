/**
 * N21 — Repair & alteration log helpers (cost rolls into accountant).
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const REPAIR_KINDS = ["REPAIR", "ALTERATION", "HEM", "ZIP", "OTHER"] as const;
export type RepairKind = (typeof REPAIR_KINDS)[number];

export type RepairLogLike = {
  costMinor: number;
  repairedOn: string; // YYYY-MM-DD or ISO datetime
};

export type CreateRepairLogInput = {
  costMinor: number;
  repairedOn: string;
  kind?: RepairKind;
  note?: string | null;
  tailorOrderId?: string | null;
};

export type CreateRepairLogResult =
  | {
      ok: true;
      costMinor: number;
      repairedOn: string;
      kind: RepairKind;
      note: string | null;
      tailorOrderId: string | null;
    }
  | { ok: false; error: string };

/** Normalize repairedOn to YYYY-MM-DD when possible. */
export function normalizeRepairDate(value: string): string | null {
  const v = value.trim();
  if (DATE_RE.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function validateCreateRepairLog(input: CreateRepairLogInput): CreateRepairLogResult {
  if (!Number.isInteger(input.costMinor) || input.costMinor < 0) {
    return { ok: false, error: "costMinor must be a non-negative integer" };
  }
  const repairedOn = normalizeRepairDate(input.repairedOn);
  if (!repairedOn) {
    return { ok: false, error: "repairedOn must be YYYY-MM-DD or ISO datetime" };
  }
  const kind = input.kind ?? "REPAIR";
  if (!(REPAIR_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: "invalid repair kind" };
  }
  return {
    ok: true,
    costMinor: input.costMinor,
    repairedOn,
    kind,
    note: input.note?.trim() ? input.note.trim() : null,
    tailorOrderId: input.tailorOrderId ?? null,
  };
}

export function sumRepairSpend(
  logs: RepairLogLike[],
  opts: { monthStart?: Date; now?: Date } = {},
): { totalMinor: number; monthlyMinor: number } {
  const now = opts.now ?? new Date();
  const monthStart =
    opts.monthStart ?? new Date(now.getFullYear(), now.getMonth(), 1);
  let totalMinor = 0;
  let monthlyMinor = 0;
  for (const log of logs) {
    const cost = Math.max(0, Math.trunc(log.costMinor));
    totalMinor += cost;
    const day = normalizeRepairDate(log.repairedOn);
    if (!day) continue;
    const d = new Date(`${day}T12:00:00.000Z`);
    if (d >= monthStart) monthlyMinor += cost;
  }
  return { totalMinor, monthlyMinor };
}

/**
 * U039 — overdue lent actions: nudge / mark returned / lost.
 */

import { applyLendReturn, isLentOut, type LentItemLike, type LentPatch } from "./borrow-lent.js";

export type LentOverdueAction = "nudge" | "returned" | "lost";

export type LentOverdueActionResult =
  | { ok: true; action: "nudge"; message: string }
  | { ok: true; action: "returned"; patch: LentPatch }
  | { ok: true; action: "lost"; patch: LentPatch; wasteNote: string }
  | { ok: false; error: string };

export function applyLentOverdueAction(
  item: LentItemLike & { category?: string | null },
  action: LentOverdueAction,
): LentOverdueActionResult {
  if (!isLentOut(item)) {
    return { ok: false, error: "item is not lent out" };
  }
  if (action === "nudge") {
    const who = (item.lentTo ?? "borrower").trim() || "borrower";
    return {
      ok: true,
      action: "nudge",
      message: `Nudge sent to ${who} — please return by ${item.lentDueOn ?? "soon"}.`,
    };
  }
  if (action === "returned") {
    const ret = applyLendReturn(item);
    if (!ret.ok) return { ok: false, error: ret.error };
    return { ok: true, action: "returned", patch: ret.patch };
  }
  // lost
  const ret = applyLendReturn(item);
  if (!ret.ok) return { ok: false, error: ret.error };
  const cat = (item.category ?? "item").trim() || "item";
  const who = (item.lentTo ?? "someone").trim() || "someone";
  return {
    ok: true,
    action: "lost",
    patch: ret.patch,
    wasteNote: `Lost while lent to ${who} — ${cat} written off.`,
  };
}

export function lentOverdueActionLabels(): Array<{
  action: LentOverdueAction;
  label: string;
}> {
  return [
    { action: "nudge", label: "Nudge borrower" },
    { action: "returned", label: "Mark returned" },
    { action: "lost", label: "Mark lost" },
  ];
}

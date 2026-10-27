/**
 * W062 — Dry-clean ticket home tile (Today / wardrobe).
 * Shows when item is IN_LAUNDRY with a pickup date.
 */

export type DryCleanHomeItemLike = {
  id: string;
  category?: string | null;
  brand?: string | null;
  laundryStatus?: "CLEAN" | "DIRTY" | "IN_LAUNDRY" | null;
  dryCleanTicket?: string | null;
  dryCleanPickupOn?: string | null;
};

export type DryCleanHomeTile = {
  itemId: string;
  headline: string;
  body: string;
  pickupOn: string;
  ticket: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Items eligible for the home tile. */
export function selectDryCleanHomeItems<T extends DryCleanHomeItemLike>(items: T[]): T[] {
  return items.filter((i) => {
    if ((i.laundryStatus ?? "CLEAN") !== "IN_LAUNDRY") return false;
    const pickup = (i.dryCleanPickupOn ?? "").trim();
    return DATE_RE.test(pickup);
  });
}

/**
 * Build a single home tile (soonest pickup wins).
 */
export function buildDryCleanHomeTile(
  items: DryCleanHomeItemLike[],
): DryCleanHomeTile | null {
  const eligible = selectDryCleanHomeItems(items).sort((a, b) =>
    String(a.dryCleanPickupOn).localeCompare(String(b.dryCleanPickupOn)),
  );
  const item = eligible[0];
  if (!item) return null;
  const pickupOn = item.dryCleanPickupOn!.trim();
  const label = [item.brand, item.category].filter(Boolean).join(" · ") || "Piece";
  const ticket = (item.dryCleanTicket ?? "").trim() || null;
  return {
    itemId: item.id,
    headline: "Dry-clean pickup",
    body: ticket
      ? `${label} · ticket ${ticket} · pickup ${pickupOn}`
      : `${label} · pickup ${pickupOn}`,
    pickupOn,
    ticket,
  };
}

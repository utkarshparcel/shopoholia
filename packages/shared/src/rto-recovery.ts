/**
 * N15 — RTO / failed-delivery recovery: checklist + refund track from package FAILED.
 */

import {
  buildRefundEtaBoardRow,
  isOnRefundEtaBoard,
  type RefundEtaBoardRow,
  type RefundEtaLedgerHint,
} from "./refund-eta.js";
import type { PackageDeliveryStatus } from "./schemas/packages.js";
import type { ReturnState } from "./schemas/returns.js";

export const RTO_CHECKLIST_IDS = [
  "CONTACT_MERCHANT",
  "OPEN_REFUND",
  "TRACK_REFUND",
  "CANCEL_OR_RESHIP",
] as const;

export type RtoChecklistId = (typeof RTO_CHECKLIST_IDS)[number];
export type RtoChecklistStepState = "done" | "current" | "todo";

export type RtoChecklistStep = {
  id: RtoChecklistId;
  label: string;
  state: RtoChecklistStepState;
};

const LABELS: Record<RtoChecklistId, string> = {
  CONTACT_MERCHANT: "Contact merchant / courier",
  OPEN_REFUND: "Open refund claim",
  TRACK_REFUND: "Track refund to ledger",
  CANCEL_OR_RESHIP: "Cancel order or accept reship",
};

export type RtoRecoveryInput = {
  deliveryStatus: string;
  /** True when a return/refund request exists for this purchase. */
  hasReturn: boolean;
  returnState?: string | null;
  ledgerCredited?: boolean;
};

/** Packages that need RTO recovery attention (open board). */
export function isOpenRtoRecovery(deliveryStatus: string, returnState?: string | null): boolean {
  if (deliveryStatus === "FAILED") return true;
  if (returnState === "INITIATED" || returnState === "CONFIRMED") return true;
  return false;
}

/** Include on board (open + closed when `all`). */
export function isOnRtoRecoveryBoard(
  deliveryStatus: string,
  opts: { hasReturn?: boolean; returnState?: string | null; all?: boolean } = {},
): boolean {
  const { hasReturn = false, returnState = null, all = false } = opts;
  if (deliveryStatus === "FAILED") return true;
  if (returnState === "INITIATED" || returnState === "CONFIRMED") return true;
  if (!all) return false;
  if (returnState === "REFUNDED") return true;
  if (hasReturn && (deliveryStatus === "CANCELLED" || deliveryStatus === "SHIPPED" || deliveryStatus === "IN_TRANSIT")) {
    return true;
  }
  return false;
}

function mark(
  id: RtoChecklistId,
  state: RtoChecklistStepState,
): RtoChecklistStep {
  return { id, label: LABELS[id], state };
}

/**
 * Build recovery checklist from delivery + return/ledger state.
 * Primary path: CONTACT → OPEN_REFUND → TRACK_REFUND.
 * CANCEL_OR_RESHIP closes when order is cancelled or reshipped (or refund lands).
 */
export function buildRtoChecklist(input: RtoRecoveryInput): RtoChecklistStep[] {
  const status = input.deliveryStatus;
  const hasReturn = input.hasReturn;
  const returnState = input.returnState ?? null;
  const credited = Boolean(input.ledgerCredited);

  const leftFailed = status !== "FAILED";
  const cancelledOrReship =
    status === "CANCELLED" ||
    status === "SHIPPED" ||
    status === "IN_TRANSIT" ||
    status === "OUT_FOR_DELIVERY" ||
    status === "DELIVERED";

  const contactDone = hasReturn || leftFailed;
  const openDone = hasReturn;
  const trackDone = credited || returnState === "REFUNDED";
  const closeDone = cancelledOrReship || trackDone;

  // First incomplete step on the primary path becomes current
  const contact: RtoChecklistStepState = contactDone ? "done" : "current";
  const open: RtoChecklistStepState = openDone ? "done" : contactDone ? "current" : "todo";
  let track: RtoChecklistStepState = "todo";
  if (trackDone) track = "done";
  else if (openDone) track = "current";

  let close: RtoChecklistStepState = "todo";
  if (closeDone) close = "done";
  else if (status === "FAILED" && openDone && !trackDone) close = "todo"; // prefer track
  else if (status === "FAILED" && contactDone && !openDone) close = "todo"; // prefer open
  else if (status === "FAILED" && !contactDone) close = "todo";
  else if (status === "FAILED") close = "current";

  return [
    mark("CONTACT_MERCHANT", contact),
    mark("OPEN_REFUND", open),
    mark("TRACK_REFUND", track),
    mark("CANCEL_OR_RESHIP", close),
  ];
}

export type RtoBoardPurchaseInput = {
  purchaseId: string;
  merchant: string;
  orderRef: string | null;
  totalMinor: number;
  currency: string;
  deliveryStatus: PackageDeliveryStatus;
  trackingCode: string | null;
  updatedAt: string | Date;
  failedAt?: string | Date | null;
};

export type RtoBoardReturnInput = {
  id: string;
  state: ReturnState;
  refundMinor: number | null;
  tracking?: string | null;
  merchant?: string | null;
  itemTitle?: string | null;
  updatedAt: string | Date;
  createdAt?: string | Date;
};

export type RtoRecoveryBoardRow = {
  purchaseId: string;
  merchant: string;
  orderRef: string | null;
  totalMinor: number;
  currency: string;
  deliveryStatus: PackageDeliveryStatus;
  trackingCode: string | null;
  failedAt: string | null;
  checklist: RtoChecklistStep[];
  returnId: string | null;
  refundTrack: RefundEtaBoardRow | null;
};

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function buildRtoRecoveryRow(
  purchase: RtoBoardPurchaseInput,
  linkedReturn: RtoBoardReturnInput | null = null,
  ledger: RefundEtaLedgerHint | null = null,
  now: Date = new Date(),
): RtoRecoveryBoardRow {
  const hasReturn = Boolean(linkedReturn);
  const returnState = linkedReturn?.state ?? null;
  const ledgerCredited = Boolean(ledger);
  const checklist = buildRtoChecklist({
    deliveryStatus: purchase.deliveryStatus,
    hasReturn,
    returnState,
    ledgerCredited,
  });

  let refundTrack: RefundEtaBoardRow | null = null;
  if (linkedReturn && isOnRefundEtaBoard(linkedReturn.state)) {
    refundTrack = buildRefundEtaBoardRow(
      {
        id: linkedReturn.id,
        state: linkedReturn.state,
        refundMinor: linkedReturn.refundMinor,
        merchant: linkedReturn.merchant ?? purchase.merchant,
        itemTitle: linkedReturn.itemTitle ?? null,
        tracking: linkedReturn.tracking ?? null,
        updatedAt: linkedReturn.updatedAt,
        createdAt: linkedReturn.createdAt,
      },
      ledger,
      now,
    );
  }

  return {
    purchaseId: purchase.purchaseId,
    merchant: purchase.merchant,
    orderRef: purchase.orderRef,
    totalMinor: purchase.totalMinor,
    currency: purchase.currency,
    deliveryStatus: purchase.deliveryStatus,
    trackingCode: purchase.trackingCode,
    failedAt: toIso(
      purchase.failedAt ?? (purchase.deliveryStatus === "FAILED" ? purchase.updatedAt : null),
    ),
    checklist,
    returnId: linkedReturn?.id ?? null,
    refundTrack,
  };
}

export function buildRtoRecoveryBoard(
  purchases: RtoBoardPurchaseInput[],
  returnsByPurchaseId: Map<string, RtoBoardReturnInput> | Record<string, RtoBoardReturnInput>,
  ledgerByReturnId: Map<string, RefundEtaLedgerHint> | Record<string, RefundEtaLedgerHint> = {},
  opts: { all?: boolean; now?: Date } = {},
): RtoRecoveryBoardRow[] {
  const now = opts.now ?? new Date();
  const all = opts.all === true;
  const returnsMap =
    returnsByPurchaseId instanceof Map
      ? returnsByPurchaseId
      : new Map(Object.entries(returnsByPurchaseId));
  const ledgerMap =
    ledgerByReturnId instanceof Map
      ? ledgerByReturnId
      : new Map(Object.entries(ledgerByReturnId));

  return purchases
    .map((p) => {
      const linked = returnsMap.get(p.purchaseId) ?? null;
      return { p, linked };
    })
    .filter(({ p, linked }) =>
      isOnRtoRecoveryBoard(p.deliveryStatus, {
        hasReturn: Boolean(linked),
        returnState: linked?.state ?? null,
        all,
      }),
    )
    .filter(({ p, linked }) => {
      if (all) return true;
      return isOpenRtoRecovery(p.deliveryStatus, linked?.state ?? null);
    })
    .map(({ p, linked }) =>
      buildRtoRecoveryRow(p, linked, linked ? (ledgerMap.get(linked.id) ?? null) : null, now),
    )
    .sort((a, b) => {
      const aFailed = a.deliveryStatus === "FAILED" ? 0 : 1;
      const bFailed = b.deliveryStatus === "FAILED" ? 0 : 1;
      if (aFailed !== bFailed) return aFailed - bFailed;
      return a.purchaseId.localeCompare(b.purchaseId);
    });
}

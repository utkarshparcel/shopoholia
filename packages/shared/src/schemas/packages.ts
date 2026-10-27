import { z } from "zod";

export const PackageDeliveryStatusSchema = z.enum([
  "ORDERED",
  "SHIPPED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
]);
export type PackageDeliveryStatus = z.infer<typeof PackageDeliveryStatusSchema>;

export const PackageSchema = z.object({
  id: z.string().uuid(),
  merchant: z.string(),
  orderRef: z.string().nullable(),
  purchasedAt: z.string().datetime(),
  currency: z.string(),
  totalMinor: z.number().int().nonnegative(),
  deliveryStatus: PackageDeliveryStatusSchema,
  etaAt: z.string().datetime().nullable(),
  trackingCode: z.string().nullable(),
  /** U018 — carrier detected from tracking paste. */
  carrier: z.string().nullable().optional(),
  deliveredAt: z.string().datetime().nullable(),
  returnWindowDeadline: z.string().datetime().nullable(),
  exchangeWindowDeadline: z.string().datetime().nullable(),
  /** U023 — user note for failed-delivery address fix. */
  deliveryAddressNote: z.string().nullable().optional(),
  /** U024 — R2 object keys for delivery/damage proof photos. */
  deliveryProofKeys: z.array(z.string()).optional(),
  itemTitles: z.array(z.string()).optional(),
  suggestWardrobeAdd: z.boolean().optional(),
  /** U027 — post-purchase cancel timer when still open. */
  coolingOff: z
    .object({
      active: z.boolean(),
      releaseAt: z.string().datetime(),
      remainingMs: z.number().int().nonnegative(),
      cancelUrl: z.string().nullable(),
      checklist: z.array(
        z.object({
          id: z.enum(["OPEN_ORDERS", "CHAT_SUPPORT", "CALL_HELPLINE", "MARK_CANCELLED"]),
          label: z.string(),
        }),
      ),
      message: z.string(),
    })
    .nullable()
    .optional(),
  /** U030 — household assignee. */
  assigneeUserId: z.string().uuid().nullable().optional(),
  assigneeLabel: z.string().nullable().optional(),
});
export type Package = z.infer<typeof PackageSchema>;

/** U030 — assign package to household member. */
export const AssignPackageBodySchema = z.object({
  assigneeUserId: z.string().uuid().nullable(),
  householdId: z.string().uuid().optional(),
});
export type AssignPackageBody = z.infer<typeof AssignPackageBodySchema>;

/** U028 — broken item recovery router response. */
export const BrokenItemRouterResponseSchema = z.object({
  path: z.enum(["RETURN", "WARRANTY", "NEITHER"]),
  reason: z.string(),
  primary: z.object({
    kind: z.enum(["INITIATE_RETURN", "CLAIM_WARRANTY", "NONE"]),
    label: z.string(),
  }),
  secondaryHint: z.string().nullable().optional(),
  purchaseId: z.string().uuid(),
  returnWindowDeadline: z.string().datetime().nullable(),
  warrantyId: z.string().uuid().nullable(),
  warrantyCoverageUntil: z.string().datetime().nullable(),
});
export type BrokenItemRouterResponse = z.infer<typeof BrokenItemRouterResponseSchema>;

export const PackagesListResponseSchema = z.object({
  packages: z.array(PackageSchema),
});
export type PackagesListResponse = z.infer<typeof PackagesListResponseSchema>;

export const UpdatePackageBodySchema = z.object({
  deliveryStatus: PackageDeliveryStatusSchema.optional(),
  etaAt: z.string().datetime().nullable().optional(),
  trackingCode: z.string().nullable().optional(),
  /** U018 — optional carrier label from client detect. */
  carrier: z.string().max(32).nullable().optional(),
  /** U023 — delivery address note for RTO reattempt. */
  deliveryAddressNote: z.string().max(500).nullable().optional(),
  /** U024 — append or replace delivery proof object keys. */
  deliveryProofKeys: z.array(z.string().min(1).max(512)).max(8).optional(),
});
export type UpdatePackageBody = z.infer<typeof UpdatePackageBodySchema>;

/** U023 — save address note + move FAILED → SHIPPED (reattempt). */
export const RtoAddressFixBodySchema = z.object({
  deliveryAddressNote: z.string().min(1).max(500),
  reattempt: z.boolean().optional(),
});
export type RtoAddressFixBody = z.infer<typeof RtoAddressFixBodySchema>;

/** U024 — attach delivery/damage photo key to package dispute packet. */
export const AttachDeliveryProofBodySchema = z.object({
  imageKey: z.string().min(1).max(512),
});
export type AttachDeliveryProofBody = z.infer<typeof AttachDeliveryProofBodySchema>;

export const MarkDeliveredBodySchema = z.object({
  addToWardrobe: z.boolean().optional(),
});
export type MarkDeliveredBody = z.infer<typeof MarkDeliveredBodySchema>;

/** N15 — RTO recovery checklist step. */
export const RtoChecklistStepSchema = z.object({
  id: z.enum(["CONTACT_MERCHANT", "OPEN_REFUND", "TRACK_REFUND", "CANCEL_OR_RESHIP"]),
  label: z.string(),
  state: z.enum(["done", "current", "todo"]),
});
export type RtoChecklistStep = z.infer<typeof RtoChecklistStepSchema>;

export const RtoStartRefundBodySchema = z.object({
  method: z.string().optional(),
});
export type RtoStartRefundBody = z.infer<typeof RtoStartRefundBodySchema>;

export const RtoRecoveryBoardRowSchema = z.object({
  purchaseId: z.string().uuid(),
  merchant: z.string(),
  orderRef: z.string().nullable(),
  totalMinor: z.number().int().nonnegative(),
  currency: z.string(),
  deliveryStatus: PackageDeliveryStatusSchema,
  trackingCode: z.string().nullable(),
  deliveryAddressNote: z.string().nullable().optional(),
  deliveryProofKeys: z.array(z.string()).optional(),
  failedAt: z.string().datetime().nullable(),
  checklist: z.array(RtoChecklistStepSchema),
  returnId: z.string().uuid().nullable(),
  refundTrack: z
    .object({
      returnId: z.string().uuid(),
      merchant: z.string().nullable(),
      itemTitle: z.string().nullable(),
      tracking: z.string().nullable(),
      state: z.string(),
      pipeline: z.array(
        z.object({
          id: z.enum(["INITIATED", "CONFIRMED", "REFUNDED"]),
          label: z.string(),
          state: z.enum(["done", "current", "todo"]),
        }),
      ),
      etaAt: z.string().datetime().nullable(),
      daysLeft: z.number().int().nullable(),
      refundMinor: z.number().int().nullable(),
      ledgerCredited: z.boolean(),
      ledgerAmountMinor: z.number().int().nullable(),
      ledgerCreditedAt: z.string().datetime().nullable(),
    })
    .nullable(),
});
export type RtoRecoveryBoardRow = z.infer<typeof RtoRecoveryBoardRowSchema>;

export const RtoRecoveryBoardResponseSchema = z.object({
  board: z.array(RtoRecoveryBoardRowSchema),
});
export type RtoRecoveryBoardResponse = z.infer<typeof RtoRecoveryBoardResponseSchema>;

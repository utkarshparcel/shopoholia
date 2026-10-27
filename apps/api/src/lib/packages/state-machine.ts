import type { PackageDeliveryStatus } from "@worn/shared";

const TRANSITIONS: Record<PackageDeliveryStatus, PackageDeliveryStatus[]> = {
  ORDERED: ["SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "CANCELLED"],
  SHIPPED: ["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "CANCELLED"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED", "CANCELLED"],
  DELIVERED: [],
  FAILED: ["SHIPPED", "IN_TRANSIT", "CANCELLED"],
  CANCELLED: [],
};

export function isValidPackageTransition(
  from: PackageDeliveryStatus,
  to: PackageDeliveryStatus,
): boolean {
  if (from === to) return true;
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function nextPackageStates(state: PackageDeliveryStatus): PackageDeliveryStatus[] {
  return TRANSITIONS[state] ?? [];
}

export const IN_TRANSIT_STATUSES: readonly PackageDeliveryStatus[] = [
  "ORDERED",
  "SHIPPED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
];

export function isInTransitStatus(status: PackageDeliveryStatus): boolean {
  return IN_TRANSIT_STATUSES.includes(status);
}

export function isTerminalPackageStatus(status: PackageDeliveryStatus): boolean {
  return status === "DELIVERED" || status === "CANCELLED";
}

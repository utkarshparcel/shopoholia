/**
 * W069 — repair spend chip for accountant P&L.
 */

import { formatMinor } from '@worn/shared';

export type RepairSpendSummaryLike = {
  repairSpendMinor?: number;
  monthlyRepairSpendMinor?: number;
};

export type RepairSpendChipModel = {
  totalMinor: number;
  monthlyMinor: number;
  label: string;
  sublabel: string;
  visible: boolean;
};

export function buildRepairSpendChip(
  summary: RepairSpendSummaryLike | null | undefined,
  currency = 'INR',
): RepairSpendChipModel {
  const totalMinor = Math.max(0, Math.trunc(summary?.repairSpendMinor ?? 0));
  const monthlyMinor = Math.max(0, Math.trunc(summary?.monthlyRepairSpendMinor ?? 0));
  return {
    totalMinor,
    monthlyMinor,
    label: `Repairs ${formatMinor(totalMinor, currency)}`,
    sublabel:
      monthlyMinor > 0
        ? `${formatMinor(monthlyMinor, currency)} this month · view ledger`
        : 'View repair ledger',
    visible: totalMinor > 0 || monthlyMinor > 0,
  };
}

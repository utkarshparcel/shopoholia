import { describe, expect, it } from 'vitest';

import { buildRepairSpendChip } from './repairSpendChip';

describe('repairSpendChip (W069)', () => {
  it('hides when zero and labels spend when present', () => {
    expect(buildRepairSpendChip({ repairSpendMinor: 0, monthlyRepairSpendMinor: 0 }).visible).toBe(
      false,
    );
    const chip = buildRepairSpendChip({
      repairSpendMinor: 50_000,
      monthlyRepairSpendMinor: 20_000,
    });
    expect(chip.visible).toBe(true);
    expect(chip.label).toMatch(/Repairs/);
    expect(chip.sublabel).toMatch(/this month/);
  });
});

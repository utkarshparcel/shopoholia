/**
 * W069 — repairSpendMinor chip on accountant P&L.
 */

import { Pressable, StyleSheet, Text } from 'react-native';

import { buildRepairSpendChip } from '@/src/lib/repairSpendChip';
import { trackEvent } from '@/src/lib/analytics';
import {
  accent,
  accentBg,
  accentSoft,
  border,
  fontSans,
  fsCaption,
  radiusPill,
  text,
  textMuted,
} from '@/src/theme/tokens';

type Props = {
  repairSpendMinor?: number;
  monthlyRepairSpendMinor?: number;
  currency?: string;
  active?: boolean;
  onPress?: () => void;
};

export function RepairSpendChip({
  repairSpendMinor,
  monthlyRepairSpendMinor,
  currency = 'INR',
  active,
  onPress,
}: Props) {
  const chip = buildRepairSpendChip(
    { repairSpendMinor, monthlyRepairSpendMinor },
    currency,
  );
  if (!chip.visible) return null;

  return (
    <Pressable
      testID="repair-spend-chip"
      accessibilityRole="button"
      accessibilityLabel={`${chip.label}. ${chip.sublabel}`}
      onPress={() => {
        trackEvent('repair_spend_chip_tap', {
          repairSpendMinor: chip.totalMinor,
          monthlyRepairSpendMinor: chip.monthlyMinor,
        });
        onPress?.();
      }}
      style={[styles.chip, active ? styles.active : null]}
    >
      <Text style={[styles.label, active ? styles.activeLabel : null]}>{chip.label}</Text>
      <Text style={styles.sub}>{chip.sublabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: accentBg,
    borderColor: border,
    borderRadius: radiusPill,
    borderWidth: 1,
    gap: 2,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  active: { borderColor: accentSoft },
  label: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '700',
  },
  activeLabel: { color: accent },
  sub: { color: textMuted, fontFamily: fontSans, fontSize: 11 },
});

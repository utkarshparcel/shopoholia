import { Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import {
  accent,
  accentBg,
  accentSoft,
  border,
  fontSansMedium,
  fsCaption,
  radiusPill,
  surface,
  text,
} from '@/src/theme/tokens';

export type ChipProps = PressableProps & {
  label: string;
  active?: boolean;
};

/**
 * A toggle chip (feed categories, reveal scenes, combine items). Screen readers hear whether it's
 * the selected one, and the touch area reaches 44pt even though the chip is drawn ~31pt tall.
 */
export function Chip({ label, active = false, style, ...props }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={{ top: 7, bottom: 7, left: 2, right: 2 }}
      style={(state) => [
        styles.chip,
        active && styles.active,
        state.pressed && !active && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      <Text style={[styles.label, active && styles.activeLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  active: {
    backgroundColor: accentBg,
    borderColor: accentSoft,
  },
  activeLabel: {
    color: accent,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusPill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  label: {
    color: text,
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
  },
  pressed: {
    borderColor: '#6e6861',
  },
});

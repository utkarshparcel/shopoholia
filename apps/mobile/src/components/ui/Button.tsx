import { Pressable, StyleSheet, Text, type PressableProps, type TextStyle, type ViewStyle } from 'react-native';

import {
  accent,
  accentBg,
  border,
  fontSansSemiBold,
  fsBody,
  fsBodyL,
  fsCaption,
  radiusMd,
  surface,
  tapTarget,
  text,
  wornInk,
  wornPaper,
} from '@/src/theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = PressableProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label: string;
  block?: boolean;
};

const sizeStyles: Record<ButtonSize, { container: ViewStyle; text: TextStyle }> = {
  sm: {
    container: { minHeight: 34, paddingHorizontal: 14 },
    text: { fontSize: fsCaption },
  },
  md: {
    container: { minHeight: tapTarget, paddingHorizontal: 22 },
    text: { fontSize: fsBody },
  },
  lg: {
    container: { minHeight: 52, paddingHorizontal: 28 },
    text: { fontSize: fsBodyL },
  },
};

const variantStyles: Record<
  ButtonVariant,
  { default: ViewStyle; pressed: ViewStyle; text: TextStyle }
> = {
  primary: {
    default: { backgroundColor: wornInk, borderColor: 'transparent' },
    pressed: { backgroundColor: '#221f1a' },
    text: { color: wornPaper },
  },
  secondary: {
    default: { backgroundColor: surface, borderColor: border },
    pressed: { borderColor: '#888078' },
    text: { color: text },
  },
  ghost: {
    default: { backgroundColor: 'transparent', borderColor: 'transparent' },
    pressed: { backgroundColor: accentBg },
    text: { color: accent },
  },
};

export function Button({
  variant = 'primary',
  size = 'md',
  label,
  block = false,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        v.default,
        s.container,
        block && styles.block,
        pressed && v.pressed,
        disabled && styles.disabled,
        style as ViewStyle,
      ]}
      {...props}
    >
      <Text style={[styles.text, v.text, s.text]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radiusMd,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  block: {
    alignSelf: 'stretch',
    width: '100%',
  },
  disabled: {
    opacity: 0.4,
  },
  text: {
    fontFamily: fontSansSemiBold,
    letterSpacing: 0.14,
  },
});

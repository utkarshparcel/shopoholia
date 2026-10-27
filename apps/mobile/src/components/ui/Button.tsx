import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ColorValue,
  type GestureResponderEvent,
  type PressableProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, withSpring, Easing } from 'react-native-reanimated';

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
  wornMuted,
  wornPaper,
  wornWarm,
  springPresets,
} from '@/src/theme/tokens';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';
import { useHaptics, hapticPresets } from '@/src/hooks/useHaptics';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends PressableProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label: string;
  block?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  hapticType?: 'light' | 'medium' | 'selection' | 'none';
}

const sizeStyles: Record<ButtonSize, { container: ViewStyle; text: TextStyle; gap: number }> = {
  sm: {
    container: { minHeight: 34, paddingHorizontal: 14 },
    text: { fontSize: fsCaption },
    gap: 6,
  },
  md: {
    container: { minHeight: tapTarget, paddingHorizontal: 22 },
    text: { fontSize: fsBody },
    gap: 8,
  },
  lg: {
    container: { minHeight: 52, paddingHorizontal: 28 },
    text: { fontSize: fsBodyL },
    gap: 10,
  },
};

const variantStyles: Record<ButtonVariant, { default: ViewStyle; pressed: ViewStyle; text: TextStyle; loading: ViewStyle }> = {
  primary: {
    default: { backgroundColor: wornInk, borderColor: 'transparent' },
    pressed: { backgroundColor: '#221f1a' },
    loading: { backgroundColor: wornInk },
    text: { color: wornPaper },
  },
  secondary: {
    default: { backgroundColor: surface, borderColor: border },
    pressed: { backgroundColor: wornWarm, borderColor: wornMuted },
    loading: { backgroundColor: surface },
    text: { color: text },
  },
  ghost: {
    default: { backgroundColor: 'transparent', borderColor: 'transparent' },
    pressed: { backgroundColor: accentBg },
    loading: { backgroundColor: 'transparent' },
    text: { color: accent },
  },
  outline: {
    default: { backgroundColor: 'transparent', borderColor: border, borderWidth: 1.5 },
    pressed: { backgroundColor: wornWarm, borderColor: wornMuted },
    loading: { backgroundColor: 'transparent', borderColor: border },
    text: { color: text },
  },
  destructive: {
    default: { backgroundColor: '#d64e2a', borderColor: 'transparent' },
    pressed: { backgroundColor: '#b03a1f' },
    loading: { backgroundColor: '#d64e2a' },
    text: { color: wornPaper },
  },
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ButtonComponent({
  variant = 'primary',
  size = 'md',
  label,
  block = false,
  disabled = false,
  loading = false,
  leftIcon,
  rightIcon,
  hapticType = 'light',
  style,
  onPress,
  ...props
}: ButtonProps) {
  const reducedMotion = useReducedMotion();
  const { trigger } = useHaptics();
  const v = variantStyles[variant];
  const s = sizeStyles[size];

  // Animated scale for press feedback
  const scale = useSharedValue(1);
  // An Animated component drops a style function, so the pressed look comes from state.
  const [pressed, setPressed] = React.useState(false);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  }, []);

  const handlePressIn = () => {
    if (disabled || loading) return;
    setPressed(true);
    if (!reducedMotion) {
      scale.value = withSpring(0.97, springPresets.snappy);
    }
    if (hapticType !== 'none') {
      trigger(hapticPresets.buttonPress);
    }
  };

  const handlePressOut = () => {
    setPressed(false);
    if (disabled || loading) return;
    if (!reducedMotion) {
      scale.value = withSpring(1.0, springPresets.standard);
    }
  };

  const handlePress = (event: GestureResponderEvent) => {
    if (disabled || loading) return;
    onPress?.(event);
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      style={[
        styles.base,
        v.default,
        s.container,
        block && styles.block,
        pressed && !disabled && !loading && v.pressed,
        (disabled || loading) && styles.disabled,
        animatedStyle,
        (typeof style === 'function' ? style({ pressed }) : style) as ViewStyle,
      ]}
      hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
      pressRetentionOffset={{ top: 16, bottom: 16, left: 24, right: 24 }}
      {...props}
    >
      {loading ? (
        <AnimatedSpinner size={size} color={v.text.color} />
      ) : (
        <View style={[styles.content, { gap: s.gap }]}>
          {leftIcon && <View style={styles.icon}>{leftIcon}</View>}
          <Text style={[styles.text, v.text, s.text]}>{label}</Text>
          {rightIcon && <View style={styles.icon}>{rightIcon}</View>}
        </View>
      )}
    </AnimatedPressable>
  );
}

// Export as default for backward compatibility
export { ButtonComponent as Button };

// ──────────────────────────────────────────────────────────────
// Loading Spinner
// ──────────────────────────────────────────────────────────────

function AnimatedSpinner({ size, color }: { size: ButtonSize; color: ColorValue | undefined }) {
  const rotation = useSharedValue(0);

  React.useEffect(() => {
    rotation.value = withTiming(1, {
      duration: 1000,
      easing: Easing.linear,
    }, (finished) => {
      if (finished) {
        rotation.value = 0;
      }
    });
  }, []);

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 360}deg` }],
  }));

  const sizeMap = { sm: 16, md: 20, lg: 24 };
  const strokeWidth = 2;

  return (
    <Animated.View style={[styles.spinnerContainer, spinnerStyle]}>
      <View style={{ width: sizeMap[size], height: sizeMap[size] }}>
        <Animated.View style={[
          styles.spinnerTrack,
          { width: sizeMap[size], height: sizeMap[size], borderWidth: strokeWidth },
        ]} />
        <Animated.View style={[
          styles.spinnerHead,
          { width: sizeMap[size], height: sizeMap[size], borderWidth: strokeWidth, borderTopColor: color },
        ]} />
      </View>
    </Animated.View>
  );
}

// ──────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────

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
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    flexShrink: 0,
  },
  text: {
    fontFamily: fontSansSemiBold,
    letterSpacing: 0.14,
    textAlign: 'center',
  },
  spinnerContainer: {
    position: 'absolute',
  },
  spinnerTrack: {
    borderRadius: 999,
    borderColor: 'transparent',
  },
  spinnerHead: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: 999,
    borderColor: 'transparent',
  },
});
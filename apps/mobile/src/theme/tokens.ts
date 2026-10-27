/**
 * WORN — Design Tokens (v1.0)
 * Premium editorial e-commerce · light · warm-paper base · gold accent
 * Closet mode: calm slate-teal utility palette
 * Enhanced with motion, haptics, and accessibility tokens
 */

import { Platform } from 'react-native';

// ── Brand Palette (Worn Play) ────────────────────────────────
export const wornInk = '#0f0e0c' as const;
export const wornInkSoft = '#2a2722' as const;
export const wornPaper = '#faf8f5' as const;
export const wornSurface = '#ffffff' as const;
export const wornWarm = '#f0ece4' as const;
export const wornWarmDeep = '#e8e1d6' as const;
export const wornRule = '#e0dbd2' as const;
export const wornMuted = '#888078' as const;
export const wornGold = '#c8a87a' as const;
export const wornGoldDeep = '#9c7a4e' as const;
export const wornGoldTint = '#fdf7ee' as const;
export const wornSale = '#d64e2a' as const;
export const wornSuccess = '#3a7d5c' as const;
export const wornCoin = '#c8a87a' as const;
export const wornCoinDeep = '#9c7a4e' as const;

// ── Closet Palette (Calm Utility) ────────────────────────────
export const closetInk = '#1a2332' as const;
export const closetInkSoft = '#3d4a5c' as const;
export const closetBg = '#eef2f5' as const;
export const closetSurface = '#f7f9fb' as const;
export const closetMist = '#e2e8ee' as const;
export const closetRule = '#c5d0d6' as const;
export const closetMuted = '#6b7a8d' as const;
export const closetAccent = '#2f6f6a' as const;
export const closetAccentSoft = '#4a9a93' as const;
export const closetAccentBg = '#e4f0ee' as const;
export const closetFound = '#1f6b4a' as const;

// Dark variants for Closet
export const closetInkDark = '#e8eef4' as const;
export const closetInkSoftDark = '#b7c2cf' as const;
export const closetBgDark = '#0f1419' as const;
export const closetSurfaceDark = '#1a222c' as const;
export const closetMistDark = '#243040' as const;
export const closetRuleDark = '#3a4758' as const;
export const closetMutedDark = '#8b9aab' as const;
export const closetAccentDark = '#5eb8b0' as const;
export const closetAccentSoftDark = '#3d8f88' as const;
export const closetAccentBgDark = '#1a3331' as const;
export const closetFoundDark = '#4ecf9a' as const;

export const closetDark = {
  ink: closetInkDark,
  inkSoft: closetInkSoftDark,
  bg: closetBgDark,
  surface: closetSurfaceDark,
  mist: closetMistDark,
  rule: closetRuleDark,
  muted: closetMutedDark,
  accent: closetAccentDark,
  accentSoft: closetAccentSoftDark,
  accentBg: closetAccentBgDark,
  found: closetFoundDark,
} as const;

// ── Semantic Role Aliases (Worn Play) ────────────────────────
export const roles = {
  bg: wornPaper,
  surface: wornSurface,
  text: wornInk,
  textBody: wornInkSoft,
  textMuted: wornMuted,
  border: wornRule,
  accent: wornGoldDeep,
  accentSoft: wornGold,
  accentBg: wornGoldTint,
  price: wornInk,
  sale: wornSale,
  success: wornSuccess,
  coin: wornCoin,
  coinDeep: wornCoinDeep,
} as const;

// Closet roles (light)
export const closet = {
  ink: closetInk,
  inkSoft: closetInkSoft,
  bg: closetBg,
  surface: closetSurface,
  mist: closetMist,
  rule: closetRule,
  muted: closetMuted,
  accent: closetAccent,
  accentSoft: closetAccentSoft,
  accentBg: closetAccentBg,
  found: closetFound,
} as const;

/** Closet role keys; light and dark define every one. */
export const CLOSET_TOKEN_KEYS = Object.keys(closet) as ClosetColorToken[];

export const brand = {
  wornInk,
  wornInkSoft,
  wornPaper,
  wornSurface,
  wornWarm,
  wornWarmDeep,
  wornRule,
  wornMuted,
  wornGold,
  wornGoldDeep,
  wornGoldTint,
  wornSale,
  wornSuccess,
  wornCoin,
  wornCoinDeep,
} as const;

// Destructured for backward compatibility
export const bg = wornPaper;
export const surface = wornSurface;
export const text = wornInk;
export const textBody = wornInkSoft;
export const textMuted = wornMuted;
export const border = wornRule;
export const accent = wornGoldDeep;
export const accentSoft = wornGold;
export const accentBg = wornGoldTint;
export const price = wornInk;
export const sale = wornSale;
export const success = wornSuccess;

// ── Type Families ────────────────────────────────────────────
export const fontDisplay = 'DMSerifDisplay_400Regular';
export const fontSans = 'DMSans_400Regular';
export const fontSansMedium = 'DMSans_500Medium';
export const fontSansSemiBold = 'DMSans_600SemiBold';
export const fontMono = 'DMMono_400Regular';

export const fonts = {
  display: fontDisplay,
  sans: fontSans,
  sansMedium: fontSansMedium,
  sansSemiBold: fontSansSemiBold,
  mono: fontMono,
} as const;

// ── Type Scale ───────────────────────────────────────────────
export const fsDisplayXl = 48;
export const lhDisplayXl = 1.0;
export const fsDisplayL = 34;
export const lhDisplayL = 1.08;
export const fsDisplayM = 24;
export const lhDisplayM = 1.15;
export const fsTitle = 18;
export const lhTitle = 1.3;
export const fsBodyL = 16;
export const lhBodyL = 1.6;
export const fsBody = 14;
export const lhBody = 1.55;
export const fsCaption = 13;
export const lhCaption = 1.5;
export const fsMicro = 11;
export const lhMicro = 1.4;

export const trackingLabel = 0.18;
export const trackingWide = 0.1;
export const trackingTight = -0.02;

export const weightLight = '300' as const;
export const weightReg = '400' as const;
export const weightMed = '500' as const;
export const weightSemi = '600' as const;

export const typography = {
  fsDisplayXl,
  lhDisplayXl,
  fsDisplayL,
  lhDisplayL,
  fsDisplayM,
  lhDisplayM,
  fsTitle,
  lhTitle,
  fsBodyL,
  lhBodyL,
  fsBody,
  lhBody,
  fsCaption,
  lhCaption,
  fsMicro,
  lhMicro,
  trackingLabel,
  trackingWide,
  trackingTight,
  weightLight,
  weightReg,
  weightMed,
  weightSemi,
} as const;

// ── Spacing (4px base) ───────────────────────────────────────
export const space0 = 0;
export const space1 = 4;
export const space2 = 8;
export const space3 = 12;
export const space4 = 16;
export const space5 = 20;
export const space6 = 24;
export const space8 = 32;
export const space10 = 40;
export const space12 = 48;
export const space16 = 64;

export const spacing = {
  0: space0,
  1: space1,
  2: space2,
  3: space3,
  4: space4,
  5: space5,
  6: space6,
  8: space8,
  10: space10,
  12: space12,
  16: space16,
} as const;

// ── Radius ───────────────────────────────────────────────────
export const radiusSm = 6;
export const radiusMd = 10;
export const radiusCard = 12;
export const radiusLg = 16;
export const radiusPill = 999;

export const radiusTokens = {
  sm: radiusSm,
  md: radiusMd,
  card: radiusCard,
  lg: radiusLg,
  pill: radiusPill,
} as const;

export const radius = radiusTokens;

// ── Shadows / Elevation ──────────────────────────────────────
function elevationStyle(
  native: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  },
  webBoxShadow: string,
) {
  if (Platform.OS === 'web') {
    return { boxShadow: webBoxShadow } as const;
  }
  return native;
}

export const shadowSm = elevationStyle(
  {
    shadowColor: wornInk,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  '0 1px 2px rgba(15, 14, 12, 0.06)',
);

export const shadowCard = elevationStyle(
  {
    shadowColor: wornInk,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  '0 2px 8px rgba(15, 14, 12, 0.06)',
);

export const shadowPop = elevationStyle(
  {
    shadowColor: wornInk,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  '0 8px 24px rgba(15, 14, 12, 0.12)',
);

export const shadowSheet = elevationStyle(
  {
    shadowColor: wornInk,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.14,
    shadowRadius: 32,
    elevation: 12,
  },
  '0 -8px 32px rgba(15, 14, 12, 0.14)',
);

export const shadows = {
  sm: shadowSm,
  card: shadowCard,
  pop: shadowPop,
  sheet: shadowSheet,
} as const;

// ── Motion Tokens ────────────────────────────────────────────
// Durations
export const durInstant = 0;
export const durFast = 100;      // Press feedback, micro-interactions
export const durNormal = 150;    // Tooltips, small popovers
export const durBase = 200;      // Dropdowns, selects, toggles
export const durSlow = 300;      // Modals, drawers, sheets
export const durSlower = 400;    // Page transitions, complex entrances
export const durSlowest = 600;   // Marketing, onboarding

// Easing curves (stronger than platform defaults)
export const easeOut = [0.23, 1, 0.32, 1] as const;        // Entrances, UI response
export const easeInOut = [0.77, 0, 0.175, 1] as const;     // On-screen movement
export const easeDrawer = [0.32, 0.72, 0, 1] as const;     // iOS sheet curve
export const easeSpring = [0.34, 1.56, 0.64, 1] as const;  // Playful overshoot
export const easeLinear = [0, 0, 1, 1] as const;           // Progress, marquee

// Spring configurations (Apple-style: duration + bounce)
export const springPresets = {
  // Quick, snappy - buttons, toggles
  snappy: { duration: 250, bounce: 0.15 },
  // Standard UI - modals, drawers
  standard: { duration: 350, bounce: 0.2 },
  // Gentle settle - sheets, cards
  gentle: { duration: 400, bounce: 0.1 },
  // Drag release - carries velocity
  dragRelease: { duration: 400, dampingRatio: 0.8 },
  // No overshoot - hard boundaries
  clamped: { duration: 300, bounce: 0, overshootClamping: true },
  // Playful - celebrations, success
  playful: { duration: 500, bounce: 0.3 },
} as const;

export const motion = {
  durInstant,
  durFast,
  durNormal,
  durBase,
  durSlow,
  durSlower,
  durSlowest,
  easeOut,
  easeInOut,
  easeDrawer,
  easeSpring,
  easeLinear,
  springPresets,
} as const;

// ── Layout Tokens ────────────────────────────────────────────
export const tapTarget = 44;           // iOS minimum
export const tapTargetAndroid = 48;    // Android minimum
export const container = 430;          // Max content width
export const zNav = 100;
export const zSheet = 200;
export const zToast = 300;
export const zModal = 400;
export const zTooltip = 500;

export const layout = {
  tapTarget,
  tapTargetAndroid,
  container,
  zNav,
  zSheet,
  zToast,
  zModal,
  zTooltip,
} as const;

// ── Haptics Tokens ───────────────────────────────────────────
export const haptics = {
  // Selection - pickers, sliders, segmented controls
  selection: 'selectionAsync',
  // Light impact - sheet detents, card snaps, drag commits
  light: 'impactAsync:Light',
  // Medium impact - heavy object lands, destructive actions
  medium: 'impactAsync:Medium',
  // Heavy impact - major transitions, errors
  heavy: 'impactAsync:Heavy',
  // Success - operation completed
  success: 'notificationAsync:Success',
  // Warning - attention needed
  warning: 'notificationAsync:Warning',
  // Error - operation failed
  error: 'notificationAsync:Error',
} as const;

// ── Accessibility Tokens ─────────────────────────────────────
export const a11y = {
  // Minimum touch target
  minTouchTarget: 44,
  // Focus ring
  focusRingWidth: 2,
  focusRingColor: wornGoldDeep,
  focusRingOffset: 2,
  // Reduced motion
  reducedMotionDurations: {
    fast: 0,
    normal: 50,
    base: 100,
    slow: 150,
  },
} as const;

// ── Z-Index Scale ────────────────────────────────────────────
export const zIndex = {
  base: 0,
  dropdown: 100,
  sticky: 200,
  modal: 300,
  popover: 400,
  tooltip: 500,
  toast: 600,
} as const;

// ── Breakpoints (for responsive web) ─────────────────────────
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

// ── Animation Presets (Reanimated-ready) ─────────────────────
export const animationPresets = {
  // Press feedback - scale down
  press: {
    transform: [{ scale: 0.97 }],
    duration: durFast,
    easing: easeOut,
  },
  // Press release - scale up slightly then settle
  pressRelease: {
    transform: [{ scale: 1.0 }],
    duration: durNormal,
    easing: easeOut,
  },
  // Card entrance - slide up + fade
  cardEnter: {
    opacity: 1,
    transform: [{ translateY: 0 }],
    duration: durBase,
    easing: easeOut,
  },
  cardExit: {
    opacity: 0,
    transform: [{ translateY: -20 }],
    duration: durNormal,
    easing: easeOut,
  },
  // Modal/sheet entrance
  modalEnter: {
    opacity: 1,
    transform: [{ translateY: 0 }],
    duration: durSlow,
    easing: easeDrawer,
  },
  modalExit: {
    opacity: 0,
    transform: [{ translateY: '100%' }],
    duration: durNormal,
    easing: easeOut,
  },
  // Toast entrance
  toastEnter: {
    opacity: 1,
    transform: [{ translateY: 0 }],
    duration: durBase,
    easing: easeOut,
  },
  toastExit: {
    opacity: 0,
    transform: [{ translateY: -20 }],
    duration: durFast,
    easing: easeOut,
  },
  // Fade
  fadeIn: {
    opacity: 1,
    duration: durNormal,
    easing: easeOut,
  },
  fadeOut: {
    opacity: 0,
    duration: durFast,
    easing: easeOut,
  },
  // Scale entrance (pop)
  scaleEnter: {
    opacity: 1,
    transform: [{ scale: 1 }],
    duration: durBase,
    easing: easeOut,
  },
  scaleExit: {
    opacity: 0,
    transform: [{ scale: 0.95 }],
    duration: durFast,
    easing: easeOut,
  },
} as const;

// Type exports for consumers
export type ColorToken = keyof typeof roles;
export type ClosetColorToken = keyof typeof closet;
export type FontToken = keyof typeof fonts;
export type SpaceToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radiusTokens;
export type ShadowToken = keyof typeof shadows;
export type MotionDuration = keyof typeof motion;
export type SpringPreset = keyof typeof springPresets;
export type AnimationPreset = keyof typeof animationPresets;
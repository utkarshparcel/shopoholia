/**
 * WORN — Design Tokens (v0.1)
 * Premium editorial e-commerce · light · warm-paper base · gold accent
 * Single source of truth mirror of docs/design-system/tokens.css
 * Change tokens.css first, then propagate here 1:1.
 */

import { Platform } from 'react-native';

// ── Brand palette ───────────────────────────────────────
export const wornInk = '#0f0e0c' as const;
export const wornInkSoft = '#2a2722' as const;
export const wornPaper = '#faf8f5' as const;
export const wornSurface = '#ffffff' as const;
export const wornWarm = '#f0ece4' as const;
export const wornWarmDeep = '#e8e1d6' as const;
export const wornRule = '#e0dbd2' as const;
export const wornMuted = '#888078' as const;

// gold accent
export const wornGold = '#c8a87a' as const;
export const wornGoldDeep = '#9c7a4e' as const;
export const wornGoldTint = '#fdf7ee' as const;

// ── Semantic ────────────────────────────────────────────
export const wornSale = '#d64e2a' as const;
export const wornSuccess = '#3a7d5c' as const;
export const wornCoin = '#c8a87a' as const;
export const wornCoinDeep = '#9c7a4e' as const;

// ── Role aliases — use THESE in components ──────────────
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

export const roles = {
  bg,
  surface,
  text,
  textBody,
  textMuted,
  border,
  accent,
  accentSoft,
  accentBg,
  price,
  sale,
  success,
} as const;

// ── Type families ───────────────────────────────────────
export const fontDisplay = 'DMSerifDisplay_400Regular';
export const fontDisplayItalic = 'DMSerifDisplay_400Regular_Italic';
export const fontSans = 'DMSans_400Regular';
export const fontSansLight = 'DMSans_300Light';
export const fontSansMedium = 'DMSans_500Medium';
export const fontSansSemiBold = 'DMSans_600SemiBold';
export const fontMono = 'DMMono_400Regular';
export const fontMonoMedium = 'DMMono_500Medium';

export const fonts = {
  display: fontDisplay,
  displayItalic: fontDisplayItalic,
  sans: fontSans,
  sansLight: fontSansLight,
  sansMedium: fontSansMedium,
  sansSemiBold: fontSansSemiBold,
  mono: fontMono,
  monoMedium: fontMonoMedium,
} as const;

// ── Type scale (mobile-first) ───────────────────────────
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

// ── Spacing (4px base) ──────────────────────────────────
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

// ── Radius ──────────────────────────────────────────────
export const radiusSm = 6;
export const radiusMd = 10;
export const radiusCard = 12;
export const radiusLg = 16;
export const radiusPill = 999;

export const radius = {
  sm: radiusSm,
  md: radiusMd,
  card: radiusCard,
  lg: radiusLg,
  pill: radiusPill,
} as const;

// Soft elevation helpers — keep native shadow* for iOS/Android; boxShadow on web.
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
    shadowColor: '#0f0e0c',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  '0 1px 2px rgba(15, 14, 12, 0.06)',
);

export const shadowCard = elevationStyle(
  {
    shadowColor: '#0f0e0c',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  '0 2px 8px rgba(15, 14, 12, 0.06)',
);

export const shadowPop = elevationStyle(
  {
    shadowColor: '#0f0e0c',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  '0 8px 24px rgba(15, 14, 12, 0.12)',
);

export const shadowSheet = elevationStyle(
  {
    shadowColor: '#0f0e0c',
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

// ── Motion ──────────────────────────────────────────────
export const durFast = 150;
export const dur = 250;
export const durSlow = 400;

export const easeOut = [0.2, 0.8, 0.2, 1.0] as const;
export const easeSpring = [0.34, 1.56, 0.64, 1.0] as const;

export const motion = {
  durFast,
  dur,
  durSlow,
  easeOut,
  easeSpring,
} as const;

// ── Layout ──────────────────────────────────────────────
export const tapTarget = 44;
export const container = 430;
export const zNav = 100;
export const zSheet = 200;
export const zToast = 300;

export const layout = {
  tapTarget,
  container,
  zNav,
  zSheet,
  zToast,
} as const;

// Per-weight imports: each package's index requires every weight, which bundles them all.
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_600SemiBold } from '@expo-google-fonts/dm-sans/600SemiBold';
import { useFonts as useDMSans } from '@expo-google-fonts/dm-sans/useFonts';
import { DMMono_400Regular } from '@expo-google-fonts/dm-mono/400Regular';
import { useFonts as useDMMono } from '@expo-google-fonts/dm-mono/useFonts';
import { DMSerifDisplay_400Regular } from '@expo-google-fonts/dm-serif-display/400Regular';
import { useFonts as useDMSerif } from '@expo-google-fonts/dm-serif-display/useFonts';
import * as SplashScreen from 'expo-splash-screen';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { View } from 'react-native';

import { captureException } from '@/src/lib/sentry';

import { bg, theme, type Theme } from './index';

SplashScreen.preventAutoHideAsync();

const ThemeContext = createContext<Theme>(theme);

export function useTheme() {
  return useContext(ThemeContext);
}

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [serifLoaded, serifError] = useDMSerif({
    DMSerifDisplay_400Regular,
  });
  const [sansLoaded, sansError] = useDMSans({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
  });
  const [monoLoaded, monoError] = useDMMono({
    DMMono_400Regular,
  });

  // A font that fails to load (a damaged asset, no disk) settles too: the app opens with the
  // system font rather than staying on the splash screen forever.
  const fontError = serifError ?? sansError ?? monoError;
  const fontsReady =
    (serifLoaded || Boolean(serifError)) &&
    (sansLoaded || Boolean(sansError)) &&
    (monoLoaded || Boolean(monoError));

  useEffect(() => {
    if (fontError) captureException(fontError, { area: 'fonts' });
  }, [fontError]);

  useEffect(() => {
    if (fontsReady) {
      void SplashScreen.hideAsync();
    }
  }, [fontsReady]);

  if (!fontsReady) {
    return <View style={{ flex: 1, backgroundColor: bg }} />;
  }

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

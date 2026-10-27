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
  const [serifLoaded] = useDMSerif({
    DMSerifDisplay_400Regular,
  });
  const [sansLoaded] = useDMSans({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
  });
  const [monoLoaded] = useDMMono({
    DMMono_400Regular,
  });

  const fontsLoaded = serifLoaded && sansLoaded && monoLoaded;

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: bg }} />;
  }

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

import {
  DMSans_300Light,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  useFonts as useDMSans,
} from '@expo-google-fonts/dm-sans';
import {
  DMMono_400Regular,
  DMMono_500Medium,
  useFonts as useDMMono,
} from '@expo-google-fonts/dm-mono';
import {
  DMSerifDisplay_400Regular,
  DMSerifDisplay_400Regular_Italic,
  useFonts as useDMSerif,
} from '@expo-google-fonts/dm-serif-display';
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
    DMSerifDisplay_400Regular_Italic,
  });
  const [sansLoaded] = useDMSans({
    DMSans_300Light,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
  });
  const [monoLoaded] = useDMMono({
    DMMono_400Regular,
    DMMono_500Medium,
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

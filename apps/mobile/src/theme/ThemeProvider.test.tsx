import { render, screen, waitFor } from '@testing-library/react';
import { Text } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fonts = vi.hoisted(() => ({
  serif: [true, null] as [boolean, Error | null],
  sans: [true, null] as [boolean, Error | null],
  mono: [true, null] as [boolean, Error | null],
  hideAsync: vi.fn(async () => undefined),
  captureException: vi.fn(),
}));

vi.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: vi.fn(async () => undefined),
  hideAsync: fonts.hideAsync,
}));
vi.mock('@expo-google-fonts/dm-sans/400Regular', () => ({ DMSans_400Regular: 1 }));
vi.mock('@expo-google-fonts/dm-sans/500Medium', () => ({ DMSans_500Medium: 1 }));
vi.mock('@expo-google-fonts/dm-sans/600SemiBold', () => ({ DMSans_600SemiBold: 1 }));
vi.mock('@expo-google-fonts/dm-sans/useFonts', () => ({ useFonts: () => fonts.sans }));
vi.mock('@expo-google-fonts/dm-mono/400Regular', () => ({ DMMono_400Regular: 1 }));
vi.mock('@expo-google-fonts/dm-mono/useFonts', () => ({ useFonts: () => fonts.mono }));
vi.mock('@expo-google-fonts/dm-serif-display/400Regular', () => ({ DMSerifDisplay_400Regular: 1 }));
vi.mock('@expo-google-fonts/dm-serif-display/useFonts', () => ({ useFonts: () => fonts.serif }));
vi.mock('@/src/lib/sentry', () => ({ captureException: fonts.captureException }));

import { ThemeProvider } from './ThemeProvider';

beforeEach(() => {
  fonts.serif = [true, null];
  fonts.sans = [true, null];
  fonts.mono = [true, null];
  fonts.hideAsync.mockClear();
  fonts.captureException.mockClear();
});

describe('ThemeProvider', () => {
  it('opens the app once the fonts are loaded', async () => {
    render(<ThemeProvider><Text>app</Text></ThemeProvider>);
    expect(screen.getByText('app')).toBeTruthy();
    await waitFor(() => expect(fonts.hideAsync).toHaveBeenCalled());
  });

  it('still opens the app (system font) when a font fails to load, and reports it', async () => {
    const failure = new Error('font asset missing');
    fonts.sans = [false, failure];
    render(<ThemeProvider><Text>app</Text></ThemeProvider>);

    expect(screen.getByText('app')).toBeTruthy();
    await waitFor(() => expect(fonts.hideAsync).toHaveBeenCalled());
    expect(fonts.captureException).toHaveBeenCalledWith(failure, { area: 'fonts' });
  });

  it('waits while a font is still loading', () => {
    fonts.mono = [false, null];
    render(<ThemeProvider><Text>app</Text></ThemeProvider>);
    expect(screen.queryByText('app')).toBeNull();
    expect(fonts.hideAsync).not.toHaveBeenCalled();
  });
});

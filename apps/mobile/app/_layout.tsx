import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Text, View } from 'react-native';

import { ApiRequestError } from '@/src/api/client';
import { usePushNotifications } from '@/src/hooks/push-notifications';
import { ensureDevAuth } from '@/src/lib/devAuth';
import { ThemeProvider } from '@/src/theme/ThemeProvider';
import { initAnalyticsFromEnv, trackEvent } from '@/src/lib/analytics';
import { initSentry } from '@/src/lib/sentry';
import { FEATURE_CLOSET } from '@/src/lib/features';
import { closetEntryHref } from '@/src/lib/firstDelight';
import { useClosetPrefsStore } from '@/src/lib/closetPrefs';
import { SurfaceToggle } from '@/src/components/SurfaceToggle';
import { useClosetStore } from '@/src/stores/closet';
import { useSessionStore } from '@/src/stores/session';
import { bg, closet, fontSans, fsCaption, space3, space4 } from '@/src/theme/tokens';

export { RootErrorBoundary as ErrorBoundary } from '@/src/components/RootErrorBoundary';

// At import, not in an effect: a render error replaces this layout before its effects run.
initSentry();

export default function RootLayout() {
  const router = useRouter();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // A refusal (4xx) won't change on a retry; a network blip or a 5xx might.
            retry: (count, error) =>
              count < 2 && !(error instanceof ApiRequestError && error.status < 500),
            staleTime: 30_000,
          },
        },
      }),
  );
  const installTracked = useRef(false);
  const surfaceRestored = useRef(false);
  const restoreFallbackToast = useSessionStore((s) => s.restoreFallbackToast);
  const clearRestoreFallbackToast = useSessionStore((s) => s.clearRestoreFallbackToast);
  usePushNotifications();

  // React Native has no window focus events: tell React Query when the app comes to the
  // foreground, so stale queries refetch on resume and polling pauses in the background.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    initAnalyticsFromEnv();
    // UX-HAPTICS: warm the native module (found money / wore-it / refund landed).
    void import('@/src/lib/delightHaptics').then((m) => {
      void m.initDelightHaptics();
    });
    // Android: register ContentResolver-backed SMS inbox adapter (no-op on iOS).
    void import('@/src/lib/smsAndroidAdapter').then((m) => {
      m.ensureAndroidSmsInboxAdapterRegistered();
    });
    // Android: Closet notification channels per category (NOTIF-RICH).
    void import('react-native').then(({ Platform }) => {
      if (Platform.OS !== 'android') return;
      void import('@/src/lib/androidChannels').then((m) => {
        void m.ensureAndroidNotificationChannels();
      });
    });
    if (!installTracked.current) {
      installTracked.current = true;
      trackEvent('install');
    }
    void ensureDevAuth().catch((error: unknown) => {
      if (__DEV__) {
        console.warn('[dev-auth]', error instanceof Error ? error.message : error);
      }
    });
  }, []);

  useEffect(() => {
    if (!FEATURE_CLOSET) return;

    const restore = () => {
      if (surfaceRestored.current) return;
      surfaceRestored.current = true;
      useClosetPrefsStore.getState().ensureEmptyCopyVariant();
      const surface = useSessionStore.getState().activeSurface;
      if (surface === 'closet') {
        const closetState = useClosetStore.getState();
        closetState.startDelightClock();
        const href = closetEntryHref({
          featureCloset: FEATURE_CLOSET,
          hasMoneyAccounts: Boolean(closetState.demoAccount),
          hasAnyConsent: false,
          onboardingSkipped: closetState.onboardingSkipped,
          onboardingCompleted: closetState.onboardingCompleted,
        });
        router.replace(href as never);
      }
    };

    if (useSessionStore.persist.hasHydrated()) {
      restore();
      return;
    }

    return useSessionStore.persist.onFinishHydration(() => {
      restore();
    });
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <StatusBar style="dark" />
        <View style={{ flex: 1 }}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: bg },
            }}
          >
            <Stack.Screen name="(tabs)" />
            {FEATURE_CLOSET ? <Stack.Screen name="(closet)" /> : null}
            <Stack.Screen name="(auth)/login" />
            <Stack.Screen name="listing/[id]" />
            <Stack.Screen name="cart" options={{ presentation: 'modal' }} />
            <Stack.Screen name="checkout" options={{ presentation: 'modal' }} />
            <Stack.Screen name="order/[id]" />
            <Stack.Screen name="reveal/[orderId]" options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen name="(onboarding)/avatar" options={{ presentation: 'modal' }} />
            <Stack.Screen name="seller/list" options={{ presentation: 'modal' }} />
            <Stack.Screen name="coins/buy" options={{ presentation: 'modal' }} />
            <Stack.Screen name="cashback" />
            <Stack.Screen name="referral" />
            <Stack.Screen name="streaks" />
            <Stack.Screen name="style-quiz" />
          </Stack>
          {FEATURE_CLOSET ? <SurfaceToggle /> : null}
          {restoreFallbackToast ? (
            <View
              accessibilityRole="alert"
              style={{
                backgroundColor: closet.accentBg,
                borderColor: closet.accentSoft,
                borderTopWidth: 1,
                bottom: 0,
                left: 0,
                padding: space4,
                position: 'absolute',
                right: 0,
                zIndex: 1100,
              }}
            >
              <Text
                style={{
                  color: closet.ink,
                  fontFamily: fontSans,
                  fontSize: fsCaption,
                  marginBottom: space3,
                }}
              >
                {restoreFallbackToast}
              </Text>
              <Text
                onPress={clearRestoreFallbackToast}
                style={{
                  color: closet.found,
                  fontFamily: fontSans,
                  fontSize: fsCaption,
                  fontWeight: '700',
                }}
              >
                Dismiss
              </Text>
            </View>
          ) : null}
        </View>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

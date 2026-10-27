import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Platform, Text, View } from 'react-native';

import { createAppQueryClient, wireOnlineManager } from '@/src/api/queryClient';
import {
  clearPersistedQueries,
  restorePersistedQueries,
  startQueryPersistence,
} from '@/src/api/queryPersistence';
import { usePushNotifications } from '@/src/hooks/push-notifications';
import { useTimeZoneSync } from '@/src/hooks/useTimeZoneSync';
import { userIdFromAccessToken } from '@/src/lib/access-token';
import { ensureDevAuth } from '@/src/lib/devAuth';
import { ThemeProvider } from '@/src/theme/ThemeProvider';
import { initAnalyticsFromEnv, trackInstallOnce } from '@/src/lib/analytics';
import { initSentry } from '@/src/lib/sentry';
import { FEATURE_CLOSET } from '@/src/lib/features';
import { closetEntryHref } from '@/src/lib/firstDelight';
import { useClosetPrefsStore } from '@/src/lib/closetPrefs';
import { SurfaceToggle } from '@/src/components/SurfaceToggle';
import { PurchasesRoot } from '@/src/lib/purchases/PurchasesRoot';
import { useClosetStore } from '@/src/stores/closet';
import { startSessionTokenPersistence, useSessionStore } from '@/src/stores/session';
import { bg, closet, fontSans, fontSansSemiBold, fsCaption, space3, space4 } from '@/src/theme/tokens';

export { RootErrorBoundary as ErrorBoundary } from '@/src/components/RootErrorBoundary';

// At import, not in an effect: a render error replaces this layout before its effects run.
initSentry();
// Read the stored session as early as possible; the layout waits for it (`tokensHydrated`).
void startSessionTokenPersistence();
wireOnlineManager();

function subscribeStoreHydration(onChange: () => void) {
  const unsubscribe = [
    useSessionStore.persist.onFinishHydration(onChange),
    useClosetStore.persist.onFinishHydration(onChange),
  ];
  return () => unsubscribe.forEach((stop) => stop());
}

function storesHydrated() {
  return useSessionStore.persist.hasHydrated() && useClosetStore.persist.hasHydrated();
}

function sessionUserId() {
  return userIdFromAccessToken(useSessionStore.getState().accessToken);
}

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [queryClient] = useState(createAppQueryClient);
  const surfaceRestored = useRef(false);
  const restoreFallbackToast = useSessionStore((s) => s.restoreFallbackToast);
  const clearRestoreFallbackToast = useSessionStore((s) => s.clearRestoreFallbackToast);
  const tokensHydrated = useSessionStore((s) => s.tokensHydrated);
  const hydrated = useSyncExternalStore(subscribeStoreHydration, storesHydrated, storesHydrated);
  const [cacheRestored, setCacheRestored] = useState(false);
  // Splash gate: nothing routes until the session, the stores and the saved queries are back,
  // so app/index.tsx doesn't send a signed-in user to the login screen.
  const ready = tokensHydrated && hydrated && cacheRestored;
  const segmentsRef = useRef(segments);
  usePushNotifications({ navigationReady: ready });
  useTimeZoneSync();

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  // The saved closet queries come back once the session is known (they belong to one user).
  useEffect(() => {
    if (!tokensHydrated) return;
    const userId = sessionUserId();
    let cancelled = false;
    void (userId ? restorePersistedQueries(queryClient, userId) : Promise.resolve(false)).finally(
      () => {
        if (!cancelled) setCacheRestored(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [tokensHydrated, queryClient]);

  // The web keeps no session across a reload, so a saved copy could never come back: keep none.
  useEffect(() => {
    if (Platform.OS === 'web') {
      void clearPersistedQueries();
      return;
    }
    return startQueryPersistence(queryClient, sessionUserId);
  }, [queryClient]);

  // Auth gate: when the session ends (sign-out, or the server refused a renewal), nothing of
  // that user stays on the device and the app goes back to the login screen.
  useEffect(
    () =>
      useSessionStore.subscribe((state, prev) => {
        if (!prev.accessToken || state.accessToken) return;
        queryClient.clear();
        void clearPersistedQueries();
        useClosetStore.getState().clear();
        if (segmentsRef.current[0] !== '(auth)') router.replace('/(auth)/login' as never);
      }),
    [queryClient, router],
  );

  // A launch with no session on a signed-in screen (a deep link, or a web reload, which keeps no
  // tokens) goes to the login screen too, instead of showing that screen empty.
  useEffect(() => {
    if (!ready || useSessionStore.getState().accessToken) return;
    const top = segmentsRef.current[0];
    if (top && top !== '(auth)' && !top.startsWith('+')) router.replace('/(auth)/login' as never);
  }, [ready, router]);

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
    // Android: Closet notification channels per category (NOTIF-RICH).
    if (Platform.OS === 'android') {
      void import('@/src/lib/androidChannels').then((m) => {
        void m.ensureAndroidNotificationChannels();
      });
    }
    void trackInstallOnce();
  }, []);

  // After the stored session is read, so a saved sign-in isn't replaced by the dev one.
  useEffect(() => {
    if (!tokensHydrated) return;
    void ensureDevAuth().catch((error: unknown) => {
      if (__DEV__) {
        console.warn('[dev-auth]', error instanceof Error ? error.message : error);
      }
    });
  }, [tokensHydrated]);

  useEffect(() => {
    if (!FEATURE_CLOSET || !ready) return;

    const restore = () => {
      if (surfaceRestored.current) return;
      surfaceRestored.current = true;
      useClosetPrefsStore.getState().ensureEmptyCopyVariant();
      const { activeSurface: surface, accessToken } = useSessionStore.getState();
      if (surface === 'closet' && accessToken) {
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

    restore();
  }, [ready, router]);

  // Same providers either way, so the theme (and its font loading) stays mounted.
  if (!ready) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <StatusBar style="dark" />
          <View style={{ flex: 1, backgroundColor: bg }} />
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

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
          <PurchasesRoot />
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
                  fontFamily: fontSansSemiBold,
                  fontSize: fsCaption,
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

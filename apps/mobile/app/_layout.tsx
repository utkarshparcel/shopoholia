import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';

import { ensureDevAuth } from '@/src/lib/devAuth';
import { ThemeProvider } from '@/src/theme/ThemeProvider';
import { trackEvent } from '@/src/lib/analytics';
import { initSentry } from '@/src/lib/sentry';
import { bg } from '@/src/theme/tokens';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const installTracked = useRef(false);

  useEffect(() => {
    initSentry();
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

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: bg },
          }}
        >
          <Stack.Screen name="(tabs)" />
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
      </ThemeProvider>
    </QueryClientProvider>
  );
}

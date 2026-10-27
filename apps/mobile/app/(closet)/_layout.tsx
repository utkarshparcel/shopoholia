import { Tabs, usePathname, useRouter } from 'expo-router';
import { View } from 'react-native';

import { BottomNav, type BottomNavItem } from '@/src/components/ui';
import { ClosetScreenFocusProvider } from '@/src/hooks/closet/screenFocus';
import { bg } from '@/src/theme/tokens';

/** A render error in one Closet screen shows a retry here instead of taking down the whole app (MOB 24). */
export { RootErrorBoundary as ErrorBoundary } from '@/src/components/RootErrorBoundary';

const NAV_ITEMS: BottomNavItem[] = [
  { key: 'today', label: 'Today', icon: '◷' },
  { key: 'wardrobe', label: 'Wardrobe', icon: '▤' },
  { key: 'vault', label: 'Vault', icon: '◰' },
  { key: 'accountant', label: 'Money', icon: '∑' },
  { key: 'recipients', label: 'Gifts', icon: '♡' },
  { key: 'fit', label: 'Fit', icon: '✂' },
  { key: 'disposition', label: 'Market', icon: '⇄' },
];

export default function ClosetLayout() {
  const router = useRouter();
  const pathname = usePathname();

  const activeKey =
    NAV_ITEMS.find((item) => pathname.includes(item.key))?.key ?? 'today';

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
          // A tab the user left stops re-rendering until they come back to it (MOB 30).
          freezeOnBlur: true,
        }}
        // Each tab knows whether it is the one on screen, so a hidden tab's queries pause.
        screenLayout={({ children }) => <ClosetScreenFocusProvider>{children}</ClosetScreenFocusProvider>}
      >
        <Tabs.Screen name="today" />
        <Tabs.Screen name="wardrobe" />
        <Tabs.Screen name="vault" />
        <Tabs.Screen name="accountant" />
        <Tabs.Screen name="recipients" />
        <Tabs.Screen name="fit" />
        <Tabs.Screen name="disposition" />
        <Tabs.Screen name="swap" options={{ href: null }} />
        <Tabs.Screen name="household" options={{ href: null }} />
        <Tabs.Screen name="returns" options={{ href: null }} />
        <Tabs.Screen name="connect-email" options={{ href: null }} />
        <Tabs.Screen name="consent" options={{ href: null }} />
        <Tabs.Screen name="privacy" options={{ href: null }} />
        <Tabs.Screen name="family-share" options={{ href: null }} />
        <Tabs.Screen name="onboarding" options={{ href: null }} />
        <Tabs.Screen name="metrics" options={{ href: null }} />
        <Tabs.Screen name="paywall" options={{ href: null }} />
      </Tabs>
      <BottomNav
        activeKey={activeKey}
        items={NAV_ITEMS}
        onPress={(key) => router.push(`/(closet)/${key}` as never)}
      />
    </View>
  );
}

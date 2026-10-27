import { Tabs, usePathname, useRouter } from 'expo-router';
import { View } from 'react-native';

import { BottomNav, type BottomNavItem } from '@/src/components/ui';
import { bg } from '@/src/theme/tokens';

const NAV_ITEMS: BottomNavItem[] = [
  { key: 'today', label: 'Today', icon: '◷' },
  { key: 'wardrobe', label: 'Wardrobe', icon: '▤' },
  { key: 'vault', label: 'Vault', icon: '◰' },
  { key: 'accountant', label: 'Accountant', icon: '∑' },
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
        }}
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

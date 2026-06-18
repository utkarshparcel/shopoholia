import { Tabs, usePathname, useRouter } from 'expo-router';
import { View } from 'react-native';

import { BottomNav, type BottomNavItem } from '@/src/components/ui';
import { bg } from '@/src/theme/tokens';

const NAV_ITEMS: BottomNavItem[] = [
  { key: 'feed', label: 'Feed', icon: '▦' },
  { key: 'lookbook', label: 'Lookbook', icon: '◫' },
  { key: 'profile', label: 'Profile', icon: '○' },
];

export default function TabsLayout() {
  const router = useRouter();
  const pathname = usePathname();

  const activeKey =
    NAV_ITEMS.find((item) => pathname.includes(item.key))?.key ?? 'feed';

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
        }}
      >
        <Tabs.Screen name="feed" />
        <Tabs.Screen name="lookbook" />
        <Tabs.Screen name="profile" />
      </Tabs>
      <BottomNav
        activeKey={activeKey}
        items={NAV_ITEMS}
        onPress={(key) => router.push(`/(tabs)/${key}` as never)}
      />
    </View>
  );
}

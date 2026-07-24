import { Pressable, StyleSheet, Text, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  accent,
  border,
  fontMono,
  sale,
  shadowSm,
  surface,
  textMuted,
} from '@/src/theme/tokens';

export type BottomNavItem = {
  key: string;
  label: string;
  icon: string;
  badge?: number;
};

export type BottomNavProps = ViewProps & {
  items: BottomNavItem[];
  activeKey: string;
  onPress: (key: string) => void;
};

export function BottomNav({ items, activeKey, onPress, style, ...props }: BottomNavProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, shadowSm, style]} {...props}>
      <View style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {items.map((item) => {
          const isActive = item.key === activeKey;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              onPress={() => onPress(item.key)}
              style={styles.navItem}
            >
              {item.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              ) : null}
              <Text style={[styles.icon, isActive && styles.iconActive]}>{item.icon}</Text>
              <Text style={[styles.label, isActive && styles.labelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    backgroundColor: sale,
    borderRadius: 999,
    height: 16,
    justifyContent: 'center',
    minWidth: 16,
    paddingHorizontal: 4,
    position: 'absolute',
    right: '50%',
    top: -4,
    transform: [{ translateX: 16 }],
    zIndex: 1,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '600',
  },
  icon: {
    color: textMuted,
    fontSize: 20,
    lineHeight: 22,
  },
  iconActive: {
    color: accent,
  },
  label: {
    color: textMuted,
    fontFamily: fontMono,
    fontSize: 9,
    letterSpacing: 0.72,
    textTransform: 'uppercase',
  },
  labelActive: {
    color: accent,
  },
  nav: {
    alignItems: 'center',
    backgroundColor: surface,
    borderTopColor: border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 6,
    paddingTop: 10,
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
    position: 'relative',
  },
  wrapper: {
    backgroundColor: surface,
  },
});

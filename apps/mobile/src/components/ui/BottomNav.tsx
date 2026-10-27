import { Pressable, StyleSheet, Text, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  accent,
  border,
  fontSans,
  sale,
  shadowSm,
  surface,
  tapTargetAndroid,
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
      <View accessibilityRole="tablist" style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {items.map((item) => {
          const isActive = item.key === activeKey;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              // The glyph means nothing read aloud: the label (and any count) is the tab's name.
              accessibilityLabel={item.badge ? `${item.label}, ${item.badge} new` : item.label}
              onPress={() => onPress(item.key)}
              style={styles.navItem}
            >
              {item.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText} maxFontSizeMultiplier={1.3}>
                    {item.badge}
                  </Text>
                </View>
              ) : null}
              <Text style={[styles.icon, isActive && styles.iconActive]} maxFontSizeMultiplier={1.3}>
                {item.icon}
              </Text>
              <Text
                style={[styles.label, isActive && styles.labelActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                maxFontSizeMultiplier={1.3}
              >
                {item.label}
              </Text>
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
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    right: '50%',
    top: -4,
    transform: [{ translateX: 16 }],
    zIndex: 1,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
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
  // Seven tabs share the width: an uppercase mono 'WARDROBE' is cut off on a 390pt phone at 11px,
  // so labels are in the narrower sans face (fits a 360pt phone).
  label: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: 11,
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
    paddingHorizontal: 2,
    paddingTop: 10,
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
    justifyContent: 'center',
    minHeight: tapTargetAndroid,
    position: 'relative',
  },
  wrapper: {
    backgroundColor: surface,
  },
});

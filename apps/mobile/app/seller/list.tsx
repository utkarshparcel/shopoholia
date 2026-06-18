import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, SectionHeader } from '@/src/components/ui';
import { bg, fontSansMedium, space4, space6, textMuted } from '@/src/theme/tokens';

export default function SellerListScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + space6, paddingBottom: insets.bottom + space6 },
      ]}
    >
      <View style={styles.content}>
        <SectionHeader kicker="Seller tools" title="List a piece" />
        <Text style={styles.copy}>
          Phase II placeholder — upload product photos, set coin price, and publish to the feed.
          Full listing flow ships next.
        </Text>
        <Button label="Back to feed" variant="secondary" block onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space6,
    paddingHorizontal: space4,
  },
  copy: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: 15,
    lineHeight: 22,
  },
  screen: {
    backgroundColor: bg,
    flex: 1,
  },
});

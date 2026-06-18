import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SectionHeader } from '@/src/components/ui';
import { bg, fontDisplay, fsDisplayM, space4, space6, text, textMuted, trackingTight } from '@/src/theme/tokens';

export default function LookbookScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + space6, paddingBottom: insets.bottom + 100 },
      ]}
    >
      <View style={styles.content}>
        <SectionHeader kicker="Coming soon" title="Your lookbook" />
        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Saved looks</Text>
          <Text style={styles.placeholderBody}>
            Build editorial outfits from pieces you love. This screen is a placeholder for the
            lookbook experience.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: space4,
  },
  placeholder: {
    alignItems: 'center',
    borderColor: '#e0dbd2',
    borderRadius: 16,
    borderStyle: 'dashed',
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    marginTop: space4,
    padding: space6,
  },
  placeholderBody: {
    color: textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  placeholderTitle: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayM,
    letterSpacing: fsDisplayM * trackingTight,
  },
  screen: {
    backgroundColor: bg,
    flex: 1,
  },
});

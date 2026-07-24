import { StyleSheet, Text, View, type ViewProps } from 'react-native';

import { fontDisplay, fontMono, fsDisplayM, accent, text, trackingTight } from '@/src/theme/tokens';

export type SectionHeaderProps = ViewProps & {
  kicker: string;
  title: string;
};

export function SectionHeader({ kicker, title, style, ...props }: SectionHeaderProps) {
  return (
    <View style={[styles.container, style]} {...props}>
      <Text style={styles.kicker}>{kicker}</Text>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  kicker: {
    color: accent,
    fontFamily: fontMono,
    fontSize: 10,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  title: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayM,
    letterSpacing: fsDisplayM * trackingTight,
    marginTop: 8,
  },
});

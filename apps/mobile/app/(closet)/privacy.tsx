import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Button } from '@/src/components/ui';
import { ClosetScreen } from '@/src/components/ClosetScreen';
import { getPrivacyPolicyInAppDocument } from '@/src/lib/privacyPolicyContent';
import { getPrivacyPolicyUrl } from '@/src/lib/privacyLinks';
import { FEATURE_CLOSET } from '@/src/lib/features';
import {
  border,
  fontSans,
  fsBody,
  fsCaption,
  radiusCard,
  space3,
  space4,
  surface,
  text,
  textMuted,
} from '@/src/theme/tokens';

/**
 * In-app privacy policy reader (W081-PRIVACY-IN-APP).
 * Opens draft markdown content without requiring store submit.
 */
export default function PrivacyScreen() {
  const router = useRouter();
  const doc = getPrivacyPolicyInAppDocument();
  const webUrl = getPrivacyPolicyUrl();

  if (!FEATURE_CLOSET) {
    return (
      <ClosetScreen
        title="Privacy"
        subtitle="Enable EXPO_PUBLIC_FEATURE_CLOSET=1 to read the privacy policy."
      />
    );
  }

  async function openWeb() {
    try {
      await WebBrowser.openBrowserAsync(webUrl);
    } catch {
      await Linking.openURL(webUrl);
    }
  }

  return (
    <ClosetScreen
      title={doc.title}
      subtitle={`Last updated (draft): ${doc.lastUpdated}. Readable in-app — no store submit required.`}
    >
      <View style={styles.banner}>
        <Text style={styles.bannerText}>{doc.banner}</Text>
      </View>

      {doc.sections.map((section) => (
        <View key={section.heading} style={styles.card}>
          <Text style={styles.heading}>{section.heading}</Text>
          <Text style={styles.body}>{section.body}</Text>
        </View>
      ))}

      <Button
        label="Open on web"
        block
        variant="secondary"
        onPress={() => void openWeb()}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={styles.back}
      >
        <Text style={styles.backLabel}>Back</Text>
      </Pressable>
    </ClosetScreen>
  );
}

const styles = StyleSheet.create({
  back: {
    alignItems: 'center',
    marginTop: space3,
    paddingVertical: space3,
  },
  backLabel: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
  },
  banner: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusCard,
    borderWidth: 1,
    marginBottom: space4,
    padding: space4,
  },
  bannerText: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
  },
  body: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsBody,
    lineHeight: 22,
    marginTop: space3,
  },
  card: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusCard,
    borderWidth: 1,
    marginBottom: space4,
    padding: space4,
  },
  heading: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '600',
  },
});

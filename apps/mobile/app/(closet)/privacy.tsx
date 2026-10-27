import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Button } from '@/src/components/ui';
import { ClosetScreen } from '@/src/components/ClosetScreen';
import { getPrivacyPolicyInAppDocument } from '@/src/lib/privacyPolicyContent';
import { getPrivacyPolicyUrl } from '@/src/lib/privacyLinks';
import { formatClosetDate } from '@/src/lib/format';
import { CLOSET_OFF_SUBTITLE } from '@/src/lib/closetScreenState';
import { FEATURE_CLOSET } from '@/src/lib/features';
import {
  border,
  fontSans,
  fontSansSemiBold,
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
 * Shows the policy summary and every outside service that receives data (Plan #13).
 */
export default function PrivacyScreen() {
  const router = useRouter();
  const doc = getPrivacyPolicyInAppDocument();
  const webUrl = getPrivacyPolicyUrl();

  if (!FEATURE_CLOSET) {
    return (
      <ClosetScreen
        title="Privacy"
        subtitle={CLOSET_OFF_SUBTITLE}
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
      subtitle={`Last updated ${formatClosetDate(doc.lastUpdated)}`}
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

      <View style={styles.card} testID="privacy-subprocessors">
        <Text style={styles.heading}>Who else receives your data</Text>
        {doc.subprocessors.map((p) => (
          <Text key={p.name} style={styles.body}>
            <Text style={styles.subName}>{p.name}: </Text>
            {p.receives}
          </Text>
        ))}
      </View>

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
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  subName: {
    color: text,
    fontWeight: '600',
  },
});

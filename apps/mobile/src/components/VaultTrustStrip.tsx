import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  VAULT_TRUST_STRIP_LABEL,
  getVaultTrustStripLinks,
} from '@/src/lib/vaultTrustStrip';
import {
  closet,
  fontSans,
  fsCaption,
  radiusMd,
  space3,
  space4,
  textMuted,
} from '@/src/theme/tokens';

/**
 * W014 — Always-visible trust strip on vault: read-only / revoke / export-delete.
 * Links into Consent (revoke + export/delete live there via TRUST-EXPORT-UI).
 */
export function VaultTrustStrip() {
  const router = useRouter();
  const links = getVaultTrustStripLinks();

  return (
    <View
      style={styles.strip}
      accessibilityRole="summary"
      accessibilityLabel={VAULT_TRUST_STRIP_LABEL}
      testID="vault-trust-strip"
    >
      <Text style={styles.label}>{VAULT_TRUST_STRIP_LABEL}</Text>
      <View style={styles.row}>
        {links.map((link) => (
          <Pressable
            key={link.id}
            accessibilityRole="link"
            accessibilityLabel={link.label}
            onPress={() => {
              if (link.focus) {
                router.push({
                  pathname: link.href,
                  params: { focus: link.focus },
                } as never);
              } else {
                router.push(link.href as never);
              }
            }}
            style={styles.linkHit}
          >
            <Text style={styles.link}>{link.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
  },
  link: {
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  linkHit: {
    paddingVertical: 2,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space3,
    marginTop: space3,
  },
  strip: {
    backgroundColor: closet.surface,
    borderColor: closet.rule,
    borderRadius: radiusMd,
    borderWidth: 1,
    marginBottom: space4,
    padding: space4,
  },
});

import { useEffect } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';

import { ClosetScreen } from '@/src/components/ClosetScreen';
import { FEATURE_CLOSET } from '@/src/lib/features';
import { VAULT_RETURNS_HREF } from '@/src/lib/firstDelight';
import { textMuted, fontSans, fsBody } from '@/src/theme/tokens';

/**
 * Deep-link alias (`worn://returns`) → Vault Returns tab (single source of truth).
 * WV01-MOBILE-UNIFY: do not maintain a separate returns surface.
 */
export default function ClosetReturnsScreen() {
  const router = useRouter();

  useEffect(() => {
    if (!FEATURE_CLOSET) return;
    router.replace(VAULT_RETURNS_HREF as never);
  }, [router]);

  if (!FEATURE_CLOSET) {
    return (
      <ClosetScreen
        title="Returns"
        subtitle="Enable EXPO_PUBLIC_FEATURE_CLOSET=1 to track return windows."
      />
    );
  }

  return (
    <ClosetScreen title="Returns" subtitle="Opening Vault…">
      <Text style={{ color: textMuted, fontFamily: fontSans, fontSize: fsBody }}>
        Redirecting to Vault Returns…
      </Text>
    </ClosetScreen>
  );
}

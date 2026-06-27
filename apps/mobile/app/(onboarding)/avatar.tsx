import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAvatar, uploadAvatar } from '@/src/api/client';
import { Button, SectionHeader } from '@/src/components/ui';
import { ensureDevAuth } from '@/src/lib/devAuth';
import { trackEvent } from '@/src/lib/analytics';
import { useSessionStore } from '@/src/stores/session';
import {
  bg,
  fontDisplay,
  fsDisplayL,
  space4,
  space6,
  text,
  textMuted,
  trackingTight,
  wornWarm,
  wornRule,
  radiusLg,
} from '@/src/theme/tokens';

type AvatarStatus = 'NONE' | 'PROCESSING' | 'READY' | 'FAILED';

export default function AvatarOnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { accessToken, coinBalance } = useSessionStore();
  const [status, setStatus] = useState<AvatarStatus>('NONE');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(Boolean(accessToken));

  const ensureAuth = useCallback(async () => {
    if (accessToken) {
      setAuthReady(true);
      return accessToken;
    }
    const token = await ensureDevAuth();
    if (!token) throw new Error('Dev auth is unavailable');
    setAuthReady(true);
    return token;
  }, [accessToken]);

  const refreshStatus = useCallback(
    async (token: string) => {
      const avatar = await getAvatar(token);
      setStatus(avatar.status as AvatarStatus);
      setPreviewUrl(avatar.referencePreviewUrl);
    },
    [],
  );

  useEffect(() => {
    void (async () => {
      try {
        const token = await ensureAuth();
        await refreshStatus(token);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to connect to API');
      }
    })();
  }, [ensureAuth, refreshStatus]);

  useEffect(() => {
    if (status !== 'PROCESSING' || !accessToken) return;
    const interval = setInterval(() => {
      void refreshStatus(accessToken).catch(() => undefined);
    }, 2000);
    return () => clearInterval(interval);
  }, [status, accessToken, refreshStatus]);

  useEffect(() => {
    if (status !== 'READY') return;
    trackEvent('avatar_complete');
  }, [status]);

  const handleUpload = async () => {
    setError(null);
    setLoading(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Photo library permission is required');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsMultipleSelection: false,
      });

      if (result.canceled || !result.assets[0]) {
        setLoading(false);
        return;
      }

      const token = await ensureAuth();
      await uploadAvatar(token, result.assets[0].uri);
      setStatus('PROCESSING');
      await refreshStatus(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + space6, paddingBottom: insets.bottom + space6 },
      ]}
    >
      <View style={styles.content}>
        <SectionHeader kicker="Onboarding" title="Create your avatar" />

        <View style={styles.avatarPlaceholder}>
          {status === 'PROCESSING' ? (
            <ActivityIndicator color="#c8a87a" size="large" />
          ) : previewUrl ? (
            <Image accessibilityLabel="Avatar preview" source={{ uri: previewUrl }} style={styles.preview} />
          ) : (
            <Text style={styles.avatarGlyph}>◎</Text>
          )}
          <Text style={styles.avatarHint}>
            {status === 'READY'
              ? 'Avatar ready'
              : status === 'PROCESSING'
                ? 'Processing your photos…'
                : status === 'FAILED'
                  ? 'Processing failed — try again'
                  : 'Upload 1–3 photos (full or upper body)'}
          </Text>
        </View>

        <Text style={styles.transparency}>
          The experience, not the outcome
        </Text>

        <Text style={styles.body}>
          Your avatar powers try-on previews and cinematic reveal renders. Nothing ships — the
          shopping arc is the product. Entertainment and self-expression, not real retail.
        </Text>

        {coinBalance > 0 ? (
          <Text style={styles.coins}>Welcome grant: {coinBalance} WORN coins</Text>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actions}>
          <Button
            disabled={loading || !authReady}
            label={loading ? 'Uploading…' : 'Upload photo'}
            onPress={() => void handleUpload()}
            block
          />
          <Button label="Skip for now" onPress={() => router.back()} variant="ghost" block />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 12,
    marginTop: space6,
  },
  avatarGlyph: {
    color: '#c8a87a',
    fontSize: 64,
  },
  avatarHint: {
    color: textMuted,
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  avatarPlaceholder: {
    alignItems: 'center',
    backgroundColor: wornWarm,
    borderColor: wornRule,
    borderRadius: radiusLg,
    borderWidth: 1,
    height: 280,
    justifyContent: 'center',
    marginVertical: space6,
    overflow: 'hidden',
    padding: space4,
  },
  body: {
    color: textMuted,
    fontSize: 16,
    lineHeight: 26,
  },
  transparency: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayL * 0.35,
    letterSpacing: fsDisplayL * trackingTight * 0.08,
    marginBottom: space4,
  },
  coins: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayL * 0.45,
    letterSpacing: fsDisplayL * trackingTight * 0.1,
    marginTop: space4,
  },
  content: {
    flex: 1,
    paddingHorizontal: space4,
  },
  error: {
    color: '#d64e2a',
    marginTop: space4,
  },
  preview: {
    borderRadius: radiusLg,
    height: '100%',
    width: '100%',
  },
  screen: {
    backgroundColor: bg,
    flex: 1,
  },
});

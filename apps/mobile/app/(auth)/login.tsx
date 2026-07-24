import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { signInWithGoogle, sendOtp, verifyOtp } from '@/src/api/client';
import { Button } from '@/src/components/ui';
import { DEV_OTP, DEV_PHONE } from '@/src/lib/devAuth';
import { useSessionStore } from '@/src/stores/session';
import {
  bg,
  border,
  fontDisplay,
  fontMono,
  fontSans,
  fontSansMedium,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  fsDisplayL,
  fsMicro,
  radiusCard,
  space4,
  space6,
  surface,
  text,
  textMuted,
  wornInk,
  wornPaper,
  wornWarm,
} from '@/src/theme/tokens';

WebBrowser.maybeCompleteAuthSession();

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const googleConfigured = Boolean(webClientId || iosClientId || androidClientId);

type GoogleButtonProps = {
  busy: boolean;
  setBusy: (v: boolean) => void;
  setError: (v: string | null) => void;
  onTokens: (tokens: {
    accessToken: string;
    refreshToken: string;
    isNewUser?: boolean;
    coinBalance?: number;
  }) => void;
};

function GoogleSignInButton({ busy, setBusy, setError, onTokens }: GoogleButtonProps) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: webClientId || iosClientId || androidClientId,
    webClientId: webClientId || undefined,
    iosClientId: iosClientId || undefined,
    androidClientId: androidClientId || undefined,
  });

  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.params.id_token;
    if (!idToken) {
      setError('Google did not return an ID token');
      return;
    }

    setBusy(true);
    setError(null);
    void signInWithGoogle(idToken)
      .then(onTokens)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Google sign-in failed');
      })
      .finally(() => setBusy(false));
  }, [response, onTokens, setBusy, setError]);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={!request || busy}
      onPress={() => {
        setError(null);
        setBusy(true);
        void promptAsync()
          .catch((e: unknown) => {
            setError(e instanceof Error ? e.message : 'Could not open Google');
          })
          .finally(() => setBusy(false));
      }}
      style={({ pressed }) => [styles.googleBtn, pressed && { opacity: 0.85 }]}
    >
      {busy ? (
        <ActivityIndicator color={wornPaper} />
      ) : (
        <>
          <Text style={styles.googleG}>G</Text>
          <Text style={styles.googleLabel}>Continue with Google</Text>
        </>
      )}
    </Pressable>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setSession = useSessionStore((s) => s.setSession);
  const accessToken = useSessionStore((s) => s.accessToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accessToken) {
      router.replace('/(tabs)/feed');
    }
  }, [accessToken, router]);

  const applyTokens = (tokens: {
    accessToken: string;
    refreshToken: string;
    isNewUser?: boolean;
    coinBalance?: number;
  }) => {
    setSession({
      email: null,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      coinBalance: tokens.coinBalance ?? 0,
    });
    router.replace(tokens.isNewUser ? '/(onboarding)/avatar' : '/(tabs)/feed');
  };

  const continueDev = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendOtp(DEV_PHONE);
      const tokens = await verifyOtp(DEV_PHONE, DEV_OTP);
      applyTokens(tokens);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Dev sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#1a1814', '#2c261e', '#0f0e0c']}
        style={[styles.heroPlane, { paddingTop: insets.top + space6 }]}
      >
        <Text style={styles.kicker}>WORN</Text>
        <Text style={styles.title}>Shop the arc.{'\n'}Reveal on you.</Text>
        <Text style={styles.subtitle}>
          Virtual hauls, timed delivery, AI try-on — sign in free with Google.
        </Text>
      </LinearGradient>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + space6 }]}>
        <View style={styles.card}>
          {googleConfigured ? (
            <GoogleSignInButton
              busy={busy}
              onTokens={applyTokens}
              setBusy={setBusy}
              setError={setError}
            />
          ) : (
            <>
              <Text style={styles.configHint}>
                Google Sign-In needs EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in your env.
              </Text>
              {__DEV__ ? (
                <Button
                  label={busy ? 'Signing in…' : 'Dev continue'}
                  onPress={() => void continueDev()}
                  disabled={busy}
                  variant="primary"
                  block
                />
              ) : null}
            </>
          )}

          {googleConfigured && __DEV__ ? (
            <Button
              label={busy ? 'Signing in…' : 'Dev continue'}
              onPress={() => void continueDev()}
              disabled={busy}
              variant="ghost"
              block
            />
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <Text style={styles.footer}>
          By continuing you agree to try pieces on your avatar and spend WORN coins in-app.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusCard,
    borderWidth: 1,
    gap: space4,
    padding: space4,
  },
  configHint: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 20,
  },
  error: {
    color: '#9a4d3a',
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
  },
  footer: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
    marginTop: space4,
    textAlign: 'center',
  },
  googleBtn: {
    alignItems: 'center',
    backgroundColor: wornInk,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: space4,
  },
  googleG: {
    color: wornPaper,
    fontFamily: fontSansSemiBold,
    fontSize: 20,
  },
  googleLabel: {
    color: wornPaper,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  heroPlane: {
    minHeight: '48%',
    paddingHorizontal: space4,
    paddingBottom: space6,
  },
  kicker: {
    color: wornWarm,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: 2,
    marginBottom: 16,
  },
  screen: {
    backgroundColor: bg,
    flex: 1,
  },
  sheet: {
    flex: 1,
    justifyContent: 'flex-start',
    marginTop: -24,
    paddingHorizontal: space4,
  },
  subtitle: {
    color: 'rgba(250,248,245,0.72)',
    fontFamily: fontSans,
    fontSize: fsBody,
    lineHeight: 22,
    marginTop: 14,
    maxWidth: 320,
  },
  title: {
    color: wornPaper,
    fontFamily: fontDisplay,
    fontSize: fsDisplayL,
    lineHeight: 40,
  },
});

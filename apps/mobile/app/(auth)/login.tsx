import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { signInWithGoogle, sendOtp, verifyOtp } from '@/src/api/client';
import { Button } from '@/src/components/ui';
import { appleSignInAvailable, signInWithApple } from '@/src/lib/appleSignIn';
import { DEV_OTP, DEV_PHONE } from '@/src/lib/devAuth';
import { getPrivacyPolicyUrl } from '@/src/lib/privacyLinks';
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
  textMuted,
  wornInk,
  wornPaper,
  wornWarm,
} from '@/src/theme/tokens';

WebBrowser.maybeCompleteAuthSession();

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
/**
 * A native Google sign-in needs this platform's own client id (its redirect is the app's bundle id
 * scheme, which the web client refuses). Release builds can't be made without it (app.config.js);
 * dev builds also accept the web client id, for the web and Expo Go.
 */
const platformClientId = Platform.select({
  ios: iosClientId,
  android: androidClientId,
  default: webClientId,
});
const googleConfigured = Boolean(
  platformClientId || (__DEV__ && (webClientId || iosClientId || androidClientId)),
);

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

  // Latest callbacks, so the effect below runs once per Google response rather than again on
  // every parent re-render (each run would exchange the same ID token and sign in again).
  const callbacks = useRef({ onTokens, setBusy, setError });
  callbacks.current = { onTokens, setBusy, setError };

  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.params.id_token;
    if (!idToken) {
      callbacks.current.setError('Google did not return an ID token');
      return;
    }

    callbacks.current.setBusy(true);
    callbacks.current.setError(null);
    void signInWithGoogle(idToken)
      .then((tokens) => callbacks.current.onTokens(tokens))
      .catch((e: unknown) => {
        callbacks.current.setError(e instanceof Error ? e.message : 'Google sign-in failed');
      })
      .finally(() => callbacks.current.setBusy(false));
  }, [response]);

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

type TokensHandler = GoogleButtonProps['onTokens'];

/** iOS only: Apple's own button, as App Review expects it, as prominent as Google's. */
function AppleSignInButton({
  busy,
  setBusy,
  setError,
  onTokens,
}: Omit<GoogleButtonProps, 'onTokens'> & { onTokens: TokensHandler }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let live = true;
    void appleSignInAvailable().then((ok) => {
      if (live) setAvailable(ok);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!available) return null;

  const onPress = () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    void signInWithApple()
      .then((result) => {
        if (result.status === 'signed-in') onTokens(result.tokens);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Sign in with Apple failed');
      })
      .finally(() => setBusy(false));
  };

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={12}
      style={styles.appleBtn}
      onPress={onPress}
    />
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setSession = useSessionStore((s) => s.setSession);
  const accessToken = useSessionStore((s) => s.accessToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Set by a sign-in on this screen, which routes on its own (a new user goes to avatar
  // onboarding). Without it the redirect below would see the new token on the next render and
  // send a brand-new user to `/` instead.
  const signedInHere = useRef(false);

  useEffect(() => {
    // A session that arrives without a sign-in here (already signed in when the screen opened,
    // or restored/dev-provisioned underneath it): the entry route picks Play or the persisted
    // Closet surface.
    if (accessToken && !signedInHere.current) {
      router.replace('/');
    }
  }, [accessToken, router]);

  // Stable, so the Google button's response effect doesn't re-run (and sign in again) whenever
  // this screen re-renders.
  const applyTokens = useCallback(
    (tokens: {
      accessToken: string;
      refreshToken: string;
      isNewUser?: boolean;
      coinBalance?: number;
    }) => {
      signedInHere.current = true;
      setSession({
        email: null,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        coinBalance: tokens.coinBalance ?? 0,
      });
      router.replace(tokens.isNewUser ? '/(onboarding)/avatar?welcome=1' : '/');
    },
    [router, setSession],
  );

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
          <AppleSignInButton
            busy={busy}
            onTokens={applyTokens}
            setBusy={setBusy}
            setError={setError}
          />
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
                {__DEV__
                  ? 'Google Sign-In needs EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in your env.'
                  : 'Sign-in is not available in this version of WORN yet.'}
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
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(getPrivacyPolicyUrl()).catch(() => undefined)}
        >
          <Text style={[styles.footer, styles.footerLink]}>Privacy policy</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appleBtn: {
    height: 52,
    width: '100%',
  },
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
  footerLink: {
    marginTop: 8,
    textDecorationLine: 'underline',
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

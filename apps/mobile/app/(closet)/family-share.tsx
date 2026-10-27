/**
 * W024 — Family share attribution confirm screen.
 * W094 — Referral deep-link landing microcopy (found-money + install CTA).
 * Deep link lander: /(closet)/family-share?code=HOME99
 */

import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { buildReferralLandingCopy } from '@worn/shared';

import { attributeReferral } from '@/src/api/client';
import { Button } from '@/src/components/ui';
import { ClosetScreen } from '@/src/components/ClosetScreen';
import {
  buildFamilyShareAttributionConfirm,
  parseFamilyShareReferralCode,
} from '@/src/lib/foundMoney';
import { trackEvent } from '@/src/lib/analytics';
import { FEATURE_CLOSET } from '@/src/lib/features';
import { closetAlertText } from '@/src/lib/closetScreenState';
import { fontSans, fontSansSemiBold, fsBody, fsCaption, space4, text, textMuted } from '@/src/theme/tokens';

export default function FamilyShareConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; url?: string }>();
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [landingInstallCta, setLandingInstallCta] = useState<string | null>(null);

  const confirm = useMemo(() => {
    const raw = params.code ?? params.url ?? '';
    const code = parseFamilyShareReferralCode(String(raw));
    return code ? buildFamilyShareAttributionConfirm(code) : null;
  }, [params.code, params.url]);

  const landing = useMemo(() => {
    if (!confirm) return null;
    return buildReferralLandingCopy(confirm.referralCode);
  }, [confirm]);

  useEffect(() => {
    if (!confirm) return;
    let cancelled = false;
    void attributeReferral(confirm.referralCode, 'family_share')
      .then((res) => {
        if (cancelled) return;
        setStatus('ok');
        if (res.landing?.installCta) {
          setLandingInstallCta(res.landing.installCta);
        }
        trackEvent('family_share_attribution_confirm', {
          referralCode: confirm.referralCode,
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setError(closetAlertText(e, 'Could not credit share'));
      });
    return () => {
      cancelled = true;
    };
  }, [confirm]);

  if (!FEATURE_CLOSET) {
    return <ClosetScreen title="Family share" subtitle="Closet feature flag off." />;
  }

  const installCta = landingInstallCta ?? landing?.installCta ?? 'Open vault';

  return (
    <ClosetScreen
      title="Family share"
      subtitle={confirm?.viaLabel ?? 'Open a worn.app/r/… link to credit found-money tips.'}
    >
      <View style={styles.card}>
        {confirm && landing ? (
          <>
            <Text style={styles.headline}>{landing.headline}</Text>
            <Text style={styles.body}>{landing.body}</Text>
            <Text style={styles.hint}>{landing.installHint}</Text>
            <Text style={styles.via}>{confirm.viaLabel}</Text>
            {status === 'ok' ? (
              <Text style={styles.ok}>Attribution saved.</Text>
            ) : null}
            {status === 'error' && error ? (
              <Text style={styles.err}>{error}</Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.body}>Missing or invalid referral code.</Text>
        )}
        <Button
          label={installCta}
          block
          onPress={() => router.replace('/(closet)/vault' as never)}
        />
      </View>
    </ClosetScreen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space4 },
  headline: { color: text, fontFamily: fontSansSemiBold, fontSize: fsBody },
  body: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption, lineHeight: 20 },
  hint: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption, lineHeight: 18 },
  via: { color: text, fontFamily: fontSans, fontSize: fsCaption },
  ok: { color: text, fontFamily: fontSans, fontSize: fsCaption },
  err: { color: '#b3261e', fontFamily: fontSans, fontSize: fsCaption },
});

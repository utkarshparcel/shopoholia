/**
 * W029 / U008 — Price-drop act card: watch / buy / dismiss with reason.
 * Soft tip only — never auto-checkout.
 */

import { useMemo, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui';
import {
  useCreatePriceWatch,
  usePriceDropScan,
} from '@/src/hooks/closet/useCloset';
import { priceDropAlertFromHit } from '@/src/lib/priceDropAlert';
import { trackEvent } from '@/src/lib/analytics';
import { closetAlertText } from '@/src/lib/closetScreenState';
import {
  PRICE_DROP_DISMISS_REASONS,
  type PriceDropDismissReason,
} from '@worn/shared';
import {
  border,
  closet,
  fontSans,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  radiusMd,
  space3,
  space4,
  text,
  textMuted,
} from '@/src/theme/tokens';

type Props = {
  /** When false, skip the scan query (e.g. off-tab). */
  enabled?: boolean;
};

const DISMISS_LABELS: Record<PriceDropDismissReason, string> = {
  TOO_EXPENSIVE: 'Still too expensive',
  WRONG_SIZE: 'Wrong size / fit',
  ALREADY_OWN: 'Already own it',
  NOT_INTERESTED: 'Not interested',
  OTHER: 'Other',
};

export function PriceDropAlertCards({ enabled = true }: Props) {
  const scan = usePriceDropScan(enabled);
  const createWatch = useCreatePriceWatch();
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const cards = useMemo(() => {
    const hits = scan.data?.hits ?? [];
    return hits
      .map((h) => priceDropAlertFromHit(h))
      .filter((c) => !dismissed.has(c.dismissKey));
  }, [scan.data?.hits, dismissed]);

  if (!enabled || cards.length === 0) return null;

  function dismissWithReason(dismissKey: string, listingId: string, brand: string) {
    Alert.alert(
      'Dismiss price drop',
      'Why are you skipping this tip?',
      [
        ...PRICE_DROP_DISMISS_REASONS.map((reason) => ({
          text: DISMISS_LABELS[reason],
          onPress: () => {
            setDismissed((prev) => new Set(prev).add(dismissKey));
            trackEvent('price_drop_dismiss_reason', {
              listingId,
              brand,
              reason,
            });
            trackEvent('price_drop_card_dismiss', { listingId, reason });
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  }

  return (
    <View style={styles.wrap} testID="price-drop-alert-cards">
      {cards.slice(0, 3).map((card) => (
        <View key={card.dismissKey} style={styles.card}>
          <Text style={styles.headline}>{card.headline}</Text>
          <Text style={styles.body}>{card.body}</Text>
          <Text style={styles.amount}>{card.amountLine}</Text>
          <View style={styles.row}>
            <Button
              label="Watch"
              size="sm"
              variant="secondary"
              onPress={() => {
                trackEvent('price_drop_watch', {
                  listingId: card.listingId,
                  brand: card.brand,
                });
                createWatch.mutate(
                  {
                    brand: card.brand,
                    watchedPriceMinor: card.currentPriceMinor,
                    thresholdPct: 10,
                  },
                  {
                    onSuccess: () =>
                      Alert.alert('Watching', `Keeping an eye on ${card.brand}.`),
                    onError: (e) =>
                      Alert.alert('Could not watch', closetAlertText(e)),
                  },
                );
              }}
            />
            <Button
              label="Buy"
              size="sm"
              onPress={() => {
                trackEvent('price_drop_buy', { listingId: card.listingId });
                // Affiliate / listing deep-link only — never Closet checkout.
                void Linking.openURL(
                  `worn://listing/${card.listingId}`,
                ).catch(() => undefined);
              }}
            />
            <Button
              label="Dismiss"
              size="sm"
              variant="ghost"
              onPress={() =>
                dismissWithReason(card.dismissKey, card.listingId, card.brand)
              }
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space3, marginBottom: space4 },
  card: {
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: space3,
    padding: space4,
    backgroundColor: closet.accentBg,
  },
  headline: { color: text, fontFamily: fontSansSemiBold, fontSize: fsBody },
  body: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption },
  amount: { color: closet.found, fontFamily: fontSans, fontSize: fsCaption },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space3 },
});

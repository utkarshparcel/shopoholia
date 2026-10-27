/**
 * W067 — shoe/bag rotation nudge cards from GET /wardrobe/rotation.
 */

import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui';
import { useLogWear, useShoeBagRotation } from '@/src/hooks/closet/useCloset';
import { trackEvent } from '@/src/lib/analytics';
import { shoeBagNudgeCardsFromSuggestions } from '@/src/lib/shoeBagNudge';
import {
  border,
  closet,
  fontSans,
  fsBody,
  fsCaption,
  radiusMd,
  space3,
  space4,
  text,
  textMuted,
} from '@/src/theme/tokens';

export function ShoeBagRotationNudge() {
  const rotation = useShoeBagRotation('all');
  const wear = useLogWear();
  const cards = shoeBagNudgeCardsFromSuggestions(rotation.data?.suggestions ?? [], 4);

  if (!cards.length) return null;

  return (
    <View style={styles.wrap} testID="shoe-bag-rotation-nudge">
      <Text style={styles.section}>Shoe & bag rotation</Text>
      <Text style={styles.lead}>Rest overworn pairs — pick from underworn next.</Text>
      {cards.map((card) => (
        <View key={card.id} style={styles.card}>
          <Text style={styles.headline}>{card.headline}</Text>
          <Text style={styles.body}>{card.body}</Text>
          <Button
            label={wear.isPending ? 'Logging…' : card.ctaLabel}
            size="sm"
            variant="secondary"
            disabled={wear.isPending}
            onPress={() =>
              wear.mutate(
                { wardrobeItemId: card.id },
                {
                  onSuccess: () => {
                    trackEvent('shoe_bag_nudge_wear', { itemId: card.id, kind: card.kind });
                    trackEvent('wardrobe_shoe_bag_rotation', { itemId: card.id });
                    void rotation.refetch();
                    Alert.alert('Logged', 'Wear counted toward rotation metrics.');
                  },
                  onError: (e) =>
                    Alert.alert('Could not log wear', (e as Error).message),
                },
              )
            }
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space3, marginBottom: space4 },
  section: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '700',
  },
  lead: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption },
  card: {
    backgroundColor: closet.accentBg,
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: space3,
    padding: space4,
  },
  headline: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '600',
  },
  body: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption },
});

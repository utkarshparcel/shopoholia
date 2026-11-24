import type { RevealRating } from '@worn/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui';
import { trackEvent } from '@/src/lib/analytics';
import {
  fontSansMedium,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  space3,
  space4,
  space6,
  text,
  textMuted,
} from '@/src/theme/tokens';

const RATINGS: Array<{ id: RevealRating; label: string }> = [
  { id: 'loved', label: 'Loved it' },
  { id: 'ok', label: 'OK' },
  { id: 'meh', label: 'Meh' },
];

type RevealSatisfactionSurveyProps = {
  orderId: string;
  onRate?: (rating: RevealRating) => void | Promise<void>;
  onContinue?: () => void;
};

export function RevealSatisfactionSurvey({
  orderId,
  onRate,
  onContinue,
}: RevealSatisfactionSurveyProps) {
  const [selected, setSelected] = useState<RevealRating | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  // The thanks shows once the rating is sent; a failed send unlocks the options to try again.
  const handleRate = async (rating: RevealRating) => {
    if (selected || submitting) return;
    setSubmitting(true);
    setFailed(false);
    try {
      await onRate?.(rating);
      setSelected(rating);
      trackEvent('reveal_rated', { orderId, rating });
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>How did the reveal feel?</Text>
      <Text style={styles.subtitle}>One tap — helps us tune the magic.</Text>
      <View style={styles.row}>
        {RATINGS.map((option) => (
          <Button
            key={option.id}
            disabled={submitting || (Boolean(selected) && selected !== option.id)}
            label={option.label}
            onPress={() => void handleRate(option.id)}
            style={styles.chip}
            variant={selected === option.id ? 'primary' : 'secondary'}
          />
        ))}
      </View>
      {failed ? (
        <Text accessibilityRole="alert" style={styles.failed}>
          Couldn’t send your rating. Tap again to retry.
        </Text>
      ) : null}
      {selected ? (
        <View style={styles.after}>
          <Text style={styles.thanks}>Thanks — noted.</Text>
          {onContinue ? (
            <Button label="Start your next haul" onPress={onContinue} variant="primary" block />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  failed: {
    color: '#9a4d3a',
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
    marginTop: space3,
    textAlign: 'center',
  },
  after: {
    gap: space4,
    marginTop: space4,
  },
  chip: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: space3,
    marginTop: space4,
  },
  subtitle: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
    marginTop: space3,
  },
  thanks: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
    textAlign: 'center',
  },
  title: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
    textAlign: 'center',
  },
  wrap: {
    marginTop: space6,
    paddingHorizontal: space4,
  },
});

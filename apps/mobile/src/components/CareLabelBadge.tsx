/**
 * W061 — Care-label badge; tap expands wash rules.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { careLabelBadge, formatCareRulesExpanded, type CareRules } from '@worn/shared';

import {
  closet,
  fontSans,
  fsCaption,
  radiusMd,
  space1,
  space2,
} from '@/src/theme/tokens';

type Props = {
  careRules:
    | {
        wash: string;
        bleach: string;
        dry: string;
        iron: string;
        dryClean: string;
        notes?: string[];
      }
    | null
    | undefined;
};

export function CareLabelBadge({ careRules }: Props) {
  const [expanded, setExpanded] = useState(false);
  const badge = careLabelBadge(careRules as CareRules | null);
  if (!badge || !careRules) return null;

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          expanded ? formatCareRulesExpanded(careRules as CareRules) : `Care: ${badge}`
        }
        onPress={() => setExpanded((v) => !v)}
        style={styles.badge}
        testID="care-label-badge"
      >
        <Text style={styles.badgeText}>{badge}</Text>
      </Pressable>
      {expanded ? (
        <Text style={styles.expanded} testID="care-label-expanded">
          {formatCareRulesExpanded(careRules as CareRules)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: closet.accentBg,
    borderColor: closet.accentSoft,
    borderRadius: radiusMd,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: space2,
    paddingHorizontal: space2,
    paddingVertical: space1,
  },
  badgeText: {
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '600',
  },
  expanded: {
    color: closet.muted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    marginTop: space1,
  },
  wrap: { marginTop: 2 },
});

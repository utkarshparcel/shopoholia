import { StyleSheet, Text, View } from 'react-native';

import { formatMinor } from '@worn/shared';

import {
  multiCardStackA11yLabel,
  multiCardStackLayers,
  shouldShowMultiCardStack,
  type ExpiringAccount,
} from '@/src/lib/vaultWow';
import {
  closet,
  fontSans,
  fsBody,
  fsCaption,
  radiusMd,
  space4,
} from '@/src/theme/tokens';

type Props = {
  accounts: ExpiringAccount[];
  now?: Date;
  /** Visible stack depth (default 3). */
  limit?: number;
};

/**
 * W019 — multi-card stack for ≥3 vault credits.
 * A11y label includes totals; no card digits.
 */
export function MultiCardStack({ accounts, now, limit = 3 }: Props) {
  if (!shouldShowMultiCardStack(accounts.length)) return null;

  const layers = multiCardStackLayers(accounts, limit, now);
  const totalMinor = accounts.reduce((s, a) => s + a.balanceCacheMinor, 0);
  const currency = accounts[0]?.currency ?? 'INR';

  return (
    <View
      style={styles.cardStack}
      accessible
      accessibilityLabel={multiCardStackA11yLabel(
        totalMinor,
        accounts.length,
        currency,
      )}
      testID="multi-card-stack"
    >
      {layers.map((layer, i) => (
        <View
          key={layer.id}
          style={[
            styles.stackCard,
            {
              top: i * 8,
              left: i * 6,
              zIndex: layers.length - i,
              opacity: 1 - i * 0.12,
            },
          ]}
          importantForAccessibility="no"
        >
          <Text style={styles.stackMerchant} numberOfLines={1}>
            {layer.merchant}
          </Text>
          <Text style={styles.stackBalance}>
            {formatMinor(layer.balanceCacheMinor, layer.currency ?? currency)}
          </Text>
        </View>
      ))}
      <View style={{ height: 56 + Math.max(0, layers.length - 1) * 8 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  cardStack: {
    marginTop: space4,
    minHeight: 56,
    position: 'relative',
  },
  stackBalance: {
    color: closet.found,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '700',
    marginTop: 2,
  },
  stackCard: {
    backgroundColor: closet.surface,
    borderColor: closet.rule,
    borderRadius: radiusMd,
    borderWidth: 1,
    left: 0,
    paddingHorizontal: space4,
    paddingVertical: space4,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  stackMerchant: {
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '600',
  },
});

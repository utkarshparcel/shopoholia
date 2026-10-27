import { StyleSheet, Text, View } from 'react-native';

import {
  expiryCountdownHero,
  type ExpiringAccount,
} from '@/src/lib/vaultWow';
import { vaultExpiryCountdownA11yLabel } from '@/src/lib/vaultA11y';
import {
  closet,
  fontSans,
  fsBody,
  fsCaption,
  radiusMd,
  space3,
  space4,
} from '@/src/theme/tokens';

type Props = {
  accounts: ExpiringAccount[];
  now?: Date;
  /** When true (push / focus=expiry|found-money), emphasize the hero. */
  highlighted?: boolean;
};

/**
 * W016 — Soonest-expiry countdown for the vault hero.
 * Shows days/hours; deep links with focus=expiry|found-money land here.
 */
export function ExpiryCountdownHero({ accounts, now, highlighted = false }: Props) {
  const hero = expiryCountdownHero(accounts, now);
  if (!hero) return null;
  const account = accounts.find((a) => a.id === hero.accountId);
  const a11y = vaultExpiryCountdownA11yLabel({
    ...hero,
    balanceMinor: account?.balanceCacheMinor,
    currency: account?.currency ?? 'INR',
  });

  return (
    <View
      style={[styles.wrap, highlighted ? styles.wrapHighlight : null]}
      accessibilityRole="summary"
      accessibilityLabel={a11y}
      testID="expiry-countdown-hero"
    >
      <Text style={styles.kicker}>Soonest expiry</Text>
      <Text style={[styles.value, hero.countdown.urgent ? styles.urgent : null]}>
        {hero.label}
      </Text>
      <Text style={styles.detail}>{hero.heroLine}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  detail: {
    color: closet.inkSoft,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
    marginTop: 2,
  },
  kicker: {
    color: closet.muted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  urgent: {
    color: '#9a6700',
  },
  value: {
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '700',
    marginTop: space3,
  },
  wrap: {
    backgroundColor: closet.accentBg,
    borderColor: closet.accentSoft,
    borderRadius: radiusMd,
    borderWidth: 1,
    marginTop: space4,
    padding: space4,
  },
  wrapHighlight: {
    borderColor: closet.accent,
    borderWidth: 2,
  },
});

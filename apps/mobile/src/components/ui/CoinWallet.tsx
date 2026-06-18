import { Pressable, StyleSheet, Text, View, type ViewProps } from 'react-native';

import {
  fontMono,
  fontSansSemiBold,
  fsBody,
  radiusPill,
  wornInk,
  wornPaper,
} from '@/src/theme/tokens';

export type CoinWalletProps = ViewProps & {
  balance: number;
  onAdd?: () => void;
};

export function CoinWallet({ balance, onAdd, style, ...props }: CoinWalletProps) {
  return (
    <View style={[styles.container, style]} {...props}>
      <View style={styles.balance}>
        <CoinIcon size="lg" />
        <Text style={styles.amount}>{balance.toLocaleString()}</Text>
        <Pressable accessibilityRole="button" onPress={onAdd} style={styles.add}>
          <Text style={styles.addIcon}>+</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>Tap + to top up your coin balance</Text>
    </View>
  );
}

type CoinIconProps = {
  size?: 'sm' | 'lg';
};

export function CoinIcon({ size = 'sm' }: CoinIconProps) {
  const dim = size === 'lg' ? 22 : 15;
  return (
    <View style={[styles.coin, { height: dim, width: dim }]}>
      <View style={[styles.coinInner, size === 'lg' && styles.coinInnerLg]} />
    </View>
  );
}

const styles = StyleSheet.create({
  add: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  addIcon: {
    color: wornPaper,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 16,
  },
  amount: {
    color: wornPaper,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  balance: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: wornInk,
    borderRadius: radiusPill,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  coin: {
    alignItems: 'center',
    backgroundColor: '#c8a87a',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(156,122,78,0.5)',
    justifyContent: 'center',
  },
  coinInner: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.45)',
    borderRadius: 3,
    borderWidth: 1,
    height: 6,
    width: 6,
  },
  coinInnerLg: {
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  container: {
    gap: 12,
  },
  hint: {
    color: '#888078',
    fontFamily: fontMono,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});

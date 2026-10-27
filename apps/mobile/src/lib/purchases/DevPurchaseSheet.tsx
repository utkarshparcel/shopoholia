import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  border,
  fontMono,
  fontSans,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  fsMicro,
  radiusCard,
  radiusLg,
  space4,
  space6,
  surface,
  text,
  textMuted,
  wornGold,
  wornInk,
} from '@/src/theme/tokens';

import { useDevPurchaseSheet } from './devClient';

/** The simulated store's payment sheet. Development builds only; no money moves. */
export function DevPurchaseSheet() {
  const request = useDevPurchaseSheet((s) => s.request);
  const choose = useDevPurchaseSheet((s) => s.choose);
  if (!request) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => choose('cancel')}>
      <View style={styles.scrim}>
        <View accessibilityRole="alert" style={styles.sheet} testID="dev-purchase-sheet">
          <Text style={styles.kicker}>Sample store · development build</Text>
          <Text style={styles.title}>{request.product.storeProductId}</Text>
          <Text style={styles.body}>
            Sample price {request.product.priceString}. No real payment is taken.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => choose('buy')} style={styles.primary}>
            <Text style={styles.primaryText}>Buy</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => choose('pending')} style={styles.secondary}>
            <Text style={styles.secondaryText}>Ask to Buy (approve in 5 s)</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => choose('cancel')} style={styles.secondary}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 20,
  },
  kicker: {
    color: textMuted,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  primary: {
    alignItems: 'center',
    backgroundColor: wornGold,
    borderRadius: radiusLg,
    paddingVertical: space4,
  },
  primaryText: {
    color: wornInk,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  scrim: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  secondary: {
    alignItems: 'center',
    borderColor: border,
    borderRadius: radiusLg,
    borderWidth: 1,
    paddingVertical: space4,
  },
  secondaryText: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  sheet: {
    backgroundColor: surface,
    borderTopLeftRadius: radiusCard,
    borderTopRightRadius: radiusCard,
    gap: 12,
    padding: space6,
  },
  title: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
});

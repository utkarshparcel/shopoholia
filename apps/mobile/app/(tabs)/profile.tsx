import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, CoinWallet, OrderTracker, SectionHeader } from '@/src/components/ui';
import { bg, space4, space6, space8 } from '@/src/theme/tokens';

const ORDER_STEPS = [
  { id: '1', label: 'Order placed', detail: 'Jun 14 · 2:41 PM', state: 'done' as const },
  { id: '2', label: 'Processing', detail: 'Atelier preparing your piece', state: 'current' as const },
  { id: '3', label: 'Shipped', detail: 'Estimated Jun 20', state: 'todo' as const },
  { id: '4', label: 'Reveal ready', detail: 'Cinematic unboxing', state: 'todo' as const },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space6, paddingBottom: insets.bottom + 100 },
      ]}
      style={styles.screen}
    >
      <SectionHeader kicker="Account" title="Your profile" />

      <CoinWallet balance={128} onAdd={() => {}} />

      <View style={styles.section}>
        <SectionHeader kicker="Active order" title="In transit" />
        <OrderTracker eta="Arrives Jun 20" orderId="#W-4821" steps={ORDER_STEPS} />
      </View>

      <Button label="Complete avatar setup" variant="secondary" block />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space8,
    paddingHorizontal: space4,
  },
  screen: {
    backgroundColor: bg,
    flex: 1,
  },
  section: {
    gap: space4,
  },
});

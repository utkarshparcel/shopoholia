import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui';
import {
  closet,
  fontSans,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  fsTitle,
  radiusMd,
  space1,
  space3,
  space4,
  space6,
  text,
  textMuted,
  wornInk,
} from '@/src/theme/tokens';

type Props = {
  visible: boolean;
  onContinue: () => void;
  onSkip: () => void;
};

/**
 * W006 — one-time Play ⇄ Closet education.
 * Two surfaces stay separate: Play = try-on; Closet = money/wardrobe.
 */
export function SurfaceEduSheet({ visible, onContinue, onSkip }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onSkip}
    >
      <Pressable style={styles.backdrop} onPress={onSkip} accessibilityRole="button">
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Two sides of WORN</Text>
          <Text style={styles.lead}>
            Play and Closet are separate on purpose — switch when you need each job.
          </Text>

          <View style={styles.row}>
            <Text style={styles.surfaceLabel}>Play</Text>
            <Text style={styles.surfaceBody}>Try-on, looks, and shopping delight.</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.surfaceLabel}>Closet</Text>
            <Text style={styles.surfaceBody}>
              Found money, returns, and the wardrobe you already own.
            </Text>
          </View>

          <View style={styles.actions}>
            <Button label="Got it" block onPress={onContinue} />
            <Button label="Skip" block variant="ghost" onPress={onSkip} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: space3,
    marginTop: space6,
  },
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 16, 12, 0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  lead: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
    marginBottom: space4,
    marginTop: space3,
  },
  row: {
    backgroundColor: closet.accentBg,
    borderColor: closet.accentSoft,
    borderRadius: radiusMd,
    borderWidth: 1,
    marginTop: space3,
    padding: space4,
  },
  sheet: {
    backgroundColor: closet.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: space6,
    paddingHorizontal: space4,
    paddingTop: space6,
    width: '100%',
  },
  surfaceBody: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
    marginTop: space1,
  },
  surfaceLabel: {
    color: wornInk,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  title: {
    color: wornInk,
    fontFamily: fontSansSemiBold,
    fontSize: fsTitle,
  },
});

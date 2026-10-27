/**
 * W083 — Track Play buy success sheet (Closet confirm; vault + wardrobe links).
 */

import { Modal, Pressable, StyleSheet, Text } from 'react-native';

import { Button } from '@/src/components/ui';
import { trackBuySuccessCopy } from '@/src/lib/bridgeWow';
import {
  fontSans,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  radiusMd,
  space3,
  space4,
  space6,
  text,
  textMuted,
} from '@/src/theme/tokens';

type Props = {
  visible: boolean;
  created: boolean;
  wardrobeCount?: number;
  onOpenVault: () => void;
  onOpenWardrobe: () => void;
  onClose: () => void;
};

export function TrackBuySuccessSheet({
  visible,
  created,
  wardrobeCount,
  onOpenVault,
  onOpenWardrobe,
  onClose,
}: Props) {
  const copy = trackBuySuccessCopy({ created, wardrobeCount });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button">
        <Pressable
          style={styles.sheet}
          onPress={(e) => e.stopPropagation()}
          testID="track-buy-success-sheet"
        >
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>
          <Button label={copy.wardrobeLabel} onPress={onOpenWardrobe} variant="primary" block />
          <Button label={copy.vaultLabel} onPress={onOpenVault} variant="secondary" block />
          <Button label="Stay on order" size="sm" variant="ghost" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(20, 16, 12, 0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#f7f3ec',
    borderTopLeftRadius: radiusMd,
    borderTopRightRadius: radiusMd,
    gap: space3,
    padding: space4,
    paddingBottom: space6,
  },
  title: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  body: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
    marginBottom: space3,
  },
});

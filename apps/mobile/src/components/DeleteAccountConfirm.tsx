import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/src/components/ui';
import {
  DELETE_CONFIRM_HINT,
  DELETE_CONFIRM_PHRASE,
  isDeleteConfirmValid,
} from '@/src/lib/deleteConfirm';
import {
  border,
  fontSans,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  radiusCard,
  space3,
  space4,
  surface,
  text,
  textMuted,
} from '@/src/theme/tokens';

type Props = {
  visible: boolean;
  email: string | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Typed hard-delete confirm (W078). Cannot dismiss while delete is in flight.
 */
export function DeleteAccountConfirm({
  visible,
  email,
  deleting,
  onCancel,
  onConfirm,
}: Props) {
  const [typed, setTyped] = useState('');
  const valid = isDeleteConfirmValid(typed, email);

  function requestClose() {
    if (deleting) return;
    setTyped('');
    onCancel();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={requestClose}
    >
      <View style={styles.backdrop} testID="delete-confirm-modal">
        <View style={styles.sheet}>
          <Text style={styles.title}>Delete your account?</Text>
          <Text style={styles.body}>
            This permanently erases your Vault and Closet data. This cannot be
            undone.
          </Text>
          <Text style={styles.hint}>{DELETE_CONFIRM_HINT}</Text>
          {email ? (
            <Text style={styles.hint}>Account email: {email}</Text>
          ) : (
            <Text style={styles.hint}>Type {DELETE_CONFIRM_PHRASE} to confirm.</Text>
          )}
          <TextInput
            testID="delete-confirm-input"
            style={styles.input}
            value={typed}
            editable={!deleting}
            onChangeText={setTyped}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={email ? `${DELETE_CONFIRM_PHRASE} or email` : DELETE_CONFIRM_PHRASE}
            placeholderTextColor={textMuted}
          />
          <Button
            label={deleting ? 'Deleting…' : 'Permanently delete'}
            block
            variant="primary"
            disabled={!valid || deleting}
            onPress={onConfirm}
          />
          <Pressable
            accessibilityRole="button"
            disabled={deleting}
            onPress={requestClose}
            style={styles.cancel}
          >
            <Text style={[styles.cancelLabel, deleting && styles.cancelDisabled]}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    flex: 1,
    justifyContent: 'center',
    padding: space4,
  },
  body: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    lineHeight: 22,
  },
  cancel: {
    alignItems: 'center',
    paddingVertical: space3,
  },
  cancelDisabled: {
    opacity: 0.4,
  },
  cancelLabel: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
  },
  hint: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
  },
  input: {
    borderColor: border,
    borderRadius: radiusCard,
    borderWidth: 1,
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sheet: {
    backgroundColor: surface,
    borderRadius: radiusCard,
    gap: space3,
    maxWidth: 420,
    padding: space4,
    width: '100%',
  },
  title: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
});

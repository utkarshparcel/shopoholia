/**
 * W060 — Autotag confirm/edit sheet before bulk save.
 */

import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  applyAutotagEdits,
  buildAutotagConfirmView,
  type AutotagConfirmDraft,
} from '@worn/shared';

import { Button } from '@/src/components/ui';
import {
  closet,
  fontSans,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  fsTitle,
  radiusMd,
  space2,
  space3,
  space4,
  space6,
  text,
  textMuted,
  wornInk,
} from '@/src/theme/tokens';

type Props = {
  visible: boolean;
  drafts: AutotagConfirmDraft[];
  onCancel: () => void;
  onConfirm: (drafts: AutotagConfirmDraft[]) => void;
};

export function AutotagConfirmSheet({ visible, drafts, onCancel, onConfirm }: Props) {
  const [index, setIndex] = useState(0);
  const [local, setLocal] = useState<AutotagConfirmDraft[]>(drafts);

  useEffect(() => {
    if (visible) {
      setLocal(drafts);
      setIndex(0);
    }
  }, [visible, drafts]);

  const current = local[index];
  const view = current ? buildAutotagConfirmView(current) : null;

  function patchCurrent(edits: { category?: string; colors?: string[]; brand?: string | null }) {
    if (!current) return;
    const next = applyAutotagEdits(current, edits);
    setLocal((prev) => prev.map((d, i) => (i === index ? next : d)));
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityRole="button">
        <Pressable
          style={styles.sheet}
          onPress={(e) => e.stopPropagation()}
          testID="autotag-confirm-sheet"
        >
          <Text style={styles.title}>Confirm tags</Text>
          <Text style={styles.lead}>
            Edit category, color, or brand before saving
            {local.length > 1 ? ` · ${index + 1}/${local.length}` : ''}.
          </Text>

          {current && view ? (
            <View style={styles.form}>
              <Text style={styles.label}>Category</Text>
              <TextInput
                style={styles.input}
                value={current.category}
                onChangeText={(category) => patchCurrent({ category })}
                placeholderTextColor={textMuted}
              />
              <Text style={styles.label}>Colors (comma-separated)</Text>
              <TextInput
                style={styles.input}
                value={current.colors.join(', ')}
                onChangeText={(v) =>
                  patchCurrent({
                    colors: v
                      .split(',')
                      .map((c) => c.trim())
                      .filter(Boolean),
                  })
                }
                placeholderTextColor={textMuted}
              />
              <Text style={styles.label}>Brand</Text>
              <TextInput
                style={styles.input}
                value={current.brand ?? ''}
                onChangeText={(brand) => patchCurrent({ brand })}
                placeholderTextColor={textMuted}
              />
              {view.softDupWarn ? (
                <Text style={styles.warn} testID="autotag-dup-warn">
                  {view.softDupWarn}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.lead}>Nothing to confirm.</Text>
          )}

          <View style={styles.row}>
            {index > 0 ? (
              <Button label="Prev" size="sm" variant="ghost" onPress={() => setIndex((i) => i - 1)} />
            ) : null}
            {index < local.length - 1 ? (
              <Button label="Next" size="sm" variant="secondary" onPress={() => setIndex((i) => i + 1)} />
            ) : null}
          </View>

          <View style={styles.actions}>
            <Button
              label="Save to closet"
              block
              disabled={!view?.canSave}
              onPress={() => onConfirm(local)}
            />
            <Button label="Cancel" block variant="ghost" onPress={onCancel} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space3, marginTop: space6 },
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 16, 12, 0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  form: { gap: space3 },
  input: {
    borderColor: closet.rule,
    borderRadius: radiusMd,
    borderWidth: StyleSheet.hairlineWidth,
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  label: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption },
  lead: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
    marginBottom: space4,
    marginTop: space3,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space3 },
  sheet: {
    backgroundColor: closet.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: space6,
    paddingHorizontal: space4,
    paddingTop: space6,
    width: '100%',
  },
  title: { color: wornInk, fontFamily: fontSansSemiBold, fontSize: fsTitle },
  warn: {
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '600',
    marginTop: space2,
  },
});

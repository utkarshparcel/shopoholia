/**
 * W060 — Autotag confirm/edit sheet before bulk save.
 */

import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  applyAutotagEdits,
  buildAutotagConfirmView,
  type AutotagConfirmDraft,
} from '@worn/shared';

import { CachedClosetImage } from '@/src/components/CachedClosetImage';
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

type FieldText = { category: string; colors: string; brand: string };

function fieldText(d: AutotagConfirmDraft): FieldText {
  return { category: d.category, colors: d.colors.join(', '), brand: d.brand ?? '' };
}

type Props = {
  visible: boolean;
  drafts: AutotagConfirmDraft[];
  onCancel: () => void;
  onConfirm: (drafts: AutotagConfirmDraft[]) => void;
};

export function AutotagConfirmSheet({ visible, drafts, onCancel, onConfirm }: Props) {
  const [index, setIndex] = useState(0);
  const [local, setLocal] = useState<AutotagConfirmDraft[]>(drafts);
  // What was typed, shown as is: the drafts are trimmed on every change, which ate the space in
  // "Louis Vuitton", the comma between colors, and snapped a cleared category back to "other".
  const [typed, setTyped] = useState<FieldText[]>(() => drafts.map(fieldText));

  useEffect(() => {
    if (visible) {
      setLocal(drafts);
      setTyped(drafts.map(fieldText));
      setIndex(0);
    }
  }, [visible, drafts]);

  const current = local[index];
  const currentText = typed[index];
  const view = current ? buildAutotagConfirmView(current) : null;

  function patchCurrent(
    field: keyof FieldText,
    value: string,
    edits: { category?: string; colors?: string[]; brand?: string | null },
  ) {
    if (!current) return;
    const next = applyAutotagEdits(current, edits);
    setLocal((prev) => prev.map((d, i) => (i === index ? next : d)));
    setTyped((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* The sheet sits at the bottom, so without this the keyboard covers the fields being edited. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          onPress={onCancel}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.sheet} testID="autotag-confirm-sheet">
          <Text style={styles.title}>Confirm tags</Text>
          <Text style={styles.lead}>
            Edit category, color, or brand before saving
            {local.length > 1 ? ` · ${index + 1}/${local.length}` : ''}.
          </Text>

          {current && currentText && view ? (
            <View style={styles.form}>
              {/* The photo being tagged: without it "1/5" gave no way to tell which piece this is. */}
              <CachedClosetImage
                uri={current.imageUri}
                contentFit="contain"
                style={styles.thumb}
                testID="autotag-photo"
              />
              <Text style={styles.label}>Category</Text>
              <TextInput
                style={styles.input}
                value={currentText.category}
                onChangeText={(category) => patchCurrent('category', category, { category })}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="other"
                placeholderTextColor={textMuted}
                testID="autotag-category"
              />
              <Text style={styles.label}>Colors (comma-separated)</Text>
              <TextInput
                style={styles.input}
                value={currentText.colors}
                onChangeText={(v) =>
                  patchCurrent('colors', v, {
                    colors: v
                      .split(',')
                      .map((c) => c.trim())
                      .filter(Boolean),
                  })
                }
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={textMuted}
                testID="autotag-colors"
              />
              <Text style={styles.label}>Brand</Text>
              <TextInput
                style={styles.input}
                value={currentText.brand}
                onChangeText={(brand) => patchCurrent('brand', brand, { brand })}
                // Brand names aren't dictionary words: autocorrect turned "Hidesign" into "Hi design".
                autoCorrect={false}
                testID="autotag-brand"
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
        </View>
      </KeyboardAvoidingView>
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
  thumb: {
    alignSelf: 'center',
    backgroundColor: closet.surface,
    borderRadius: radiusMd,
    height: 120,
    width: 120,
  },
  title: { color: wornInk, fontFamily: fontSansSemiBold, fontSize: fsTitle },
  warn: {
    color: closet.ink,
    fontFamily: fontSansSemiBold,
    fontSize: fsCaption,
    marginTop: space2,
  },
});

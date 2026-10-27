import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/src/components/ui';
import {
  closet,
  fontSans,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  fsTitle,
  radiusMd,
  sale,
  space3,
  space4,
  space6,
} from '@/src/theme/tokens';

export type PromptField = {
  key: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
};

export type PromptValues = Record<string, string>;

export type PromptOptions = {
  title: string;
  message?: string;
  fields: readonly PromptField[];
  confirmLabel?: string;
  cancelLabel?: string;
  /** Returns the error to show under the fields, or null when the values can be submitted. */
  validate?: (values: PromptValues) => string | null;
};

function initialValues(fields: readonly PromptField[]): PromptValues {
  const values: PromptValues = {};
  for (const f of fields) values[f.key] = f.defaultValue ?? '';
  return values;
}

/**
 * Text prompt that works on iOS, Android and web. `Alert.prompt` exists only
 * on iOS, so on Android every action built on it did nothing or guessed.
 * Values come back trimmed; Cancel, the backdrop and Back all resolve null.
 */
export function PromptSheet({
  request,
  onResolve,
}: {
  request: PromptOptions | null;
  onResolve: (values: PromptValues | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const [values, setValues] = useState<PromptValues>(() => (request ? initialValues(request.fields) : {}));
  const [error, setError] = useState<string | null>(null);
  // A new request starts from its own defaults (React's "adjust state when a prop changes" pattern).
  const [shownFor, setShownFor] = useState(request);
  if (shownFor !== request) {
    setShownFor(request);
    setValues(request ? initialValues(request.fields) : {});
    setError(null);
  }

  if (!request) return null;

  const cancel = () => onResolve(null);
  const submit = () => {
    const trimmed: PromptValues = {};
    for (const f of request.fields) trimmed[f.key] = (values[f.key] ?? '').trim();
    const problem = request.validate?.(trimmed) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    onResolve(trimmed);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={cancel}>
      {/* Anchored near the top so the keyboard never covers the fields. */}
      <View style={[styles.backdrop, { paddingTop: insets.top + space6 * 2 }]}>
        {/* A sibling behind the card, not a wrapper: on web a role="button" wrapper nests the card's buttons. */}
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          onPress={cancel}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.card} testID="prompt-sheet" accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">
            {request.title}
          </Text>
          {request.message ? <Text style={styles.message}>{request.message}</Text> : null}
          {request.fields.map((f, i) => (
            <View key={f.key} style={styles.field}>
              <Text style={styles.label}>{f.label}</Text>
              <TextInput
                testID={`prompt-field-${f.key}`}
                accessibilityLabel={f.label}
                style={styles.input}
                value={values[f.key] ?? ''}
                onChangeText={(text) => {
                  setValues((prev) => ({ ...prev, [f.key]: text }));
                  setError(null);
                }}
                placeholder={f.placeholder}
                placeholderTextColor={closet.muted}
                keyboardType={f.keyboardType}
                maxLength={f.maxLength ?? 200}
                autoFocus={i === 0}
                returnKeyType={i === request.fields.length - 1 ? 'done' : 'next'}
                onSubmitEditing={i === request.fields.length - 1 ? submit : undefined}
              />
            </View>
          ))}
          {error ? (
            <Text style={styles.error} testID="prompt-error" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Button label={request.cancelLabel ?? 'Cancel'} size="sm" variant="ghost" onPress={cancel} />
            <Button label={request.confirmLabel ?? 'Save'} size="sm" onPress={submit} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * `const { ask, promptElement } = usePrompt()`; render `promptElement` once in
 * the screen, then `const values = await ask({...})` (null when cancelled).
 * A new ask settles any open one with null, so no caller waits forever.
 */
export function usePrompt() {
  const [request, setRequest] = useState<PromptOptions | null>(null);
  const resolverRef = useRef<((values: PromptValues | null) => void) | null>(null);

  const settle = useCallback((values: PromptValues | null) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    resolve?.(values);
  }, []);

  const ask = useCallback((options: PromptOptions) => {
    resolverRef.current?.(null);
    return new Promise<PromptValues | null>((resolve) => {
      resolverRef.current = resolve;
      // A fresh object, so asking again with the same options still resets the fields.
      setRequest({ ...options });
    });
  }, []);

  useEffect(
    () => () => {
      resolverRef.current?.(null);
      resolverRef.current = null;
    },
    [],
  );

  return { ask, promptElement: <PromptSheet request={request} onResolve={settle} /> };
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: space3,
    justifyContent: 'flex-end',
    marginTop: space6,
  },
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 16, 12, 0.45)',
    flex: 1,
    paddingHorizontal: space4,
  },
  card: {
    backgroundColor: closet.bg,
    borderRadius: 16,
    maxWidth: 420,
    padding: space6,
    width: '100%',
  },
  error: {
    color: sale,
    fontFamily: fontSans,
    fontSize: fsCaption,
    marginTop: space3,
  },
  field: { gap: 6, marginTop: space4 },
  input: {
    backgroundColor: closet.surface,
    borderColor: closet.rule,
    borderRadius: radiusMd,
    borderWidth: 1,
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsBody,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  label: { color: closet.muted, fontFamily: fontSans, fontSize: fsCaption },
  message: {
    color: closet.muted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
    marginTop: space3,
  },
  title: { color: closet.ink, fontFamily: fontSansSemiBold, fontSize: fsTitle },
});

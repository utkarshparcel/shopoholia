import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/src/components/ui';
import { ClosetScreen } from '@/src/components/ClosetScreen';
import {
  useMeasurements,
  useCreateMeasurement,
  useTemplates,
  useCreateTailoringOrder,
  useTailoringOrders,
  useReorderTailoringOrder,
  useFitTailors,
  useFitPreview,
} from '@/src/hooks/closet/useCloset';
import { FEATURE_CLOSET } from '@/src/lib/features';
import { initialSelections, optionGroups, parseTemplateOptions, selectionSummary } from '@/src/lib/fitOptions';
import { useClosetPrefsStore } from '@/src/lib/closetPrefs';
import { bg, border, radiusMd, fontSans, fsBody, fsCaption, text, textMuted, surface, space4 } from '@/src/theme/tokens';

export default function FitVaultScreen() {
  const preferredFitRegion = useClosetPrefsStore((s) => s.preferredFitRegion);
  const { data: mData } = useMeasurements();
  const { data: tData } = useTemplates(preferredFitRegion);
  const { data: oData } = useTailoringOrders();
  const { data: tailorData } = useFitTailors();
  const createM = useCreateMeasurement();
  const createO = useCreateTailoringOrder();
  const reorder = useReorderTailoringOrder();
  const previewMut = useFitPreview();
  const [bust, setBust] = useState('');
  const [waist, setWaist] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [selectedTailor, setSelectedTailor] = useState<string | null>(null);
  const [previewSummary, setPreviewSummary] = useState<string | null>(null);

  const measurements = mData?.measurements ?? [];
  const templates = tData?.templates ?? [];
  const orders = oData?.orders ?? [];
  const tailors = tailorData?.tailors ?? [];
  const activeTemplate = templates.find((t) => t.id === selectedTemplate);
  const schema = parseTemplateOptions(activeTemplate?.optionsSchema as Record<string, unknown> | undefined);
  const groups = optionGroups(schema);

  useEffect(() => {
    if (!selectedTemplate || !activeTemplate) return;
    setSelections(initialSelections(schema));
    // Reset only when the template changes.
  }, [selectedTemplate]);

  if (!FEATURE_CLOSET) {
    return <ClosetScreen title="Fit Vault" subtitle="Enable EXPO_PUBLIC_FEATURE_CLOSET=1 to view fit vault." />;
  }

  function handleSaveMeasurements() {
    const points: Record<string, number> = {};
    if (bust) points.bust = Number(bust);
    if (waist) points.waist = Number(waist);
    if (Object.keys(points).length === 0) return Alert.alert('Add at least one point');
    createM.mutate(
      { points, region: preferredFitRegion, unit: 'CM' },
      { onError: (e) => Alert.alert('Failed', (e as Error).message) },
    );
  }

  function handlePreview() {
    if (!selectedTemplate) return Alert.alert('Pick a template');
    previewMut.mutate(
      { templateId: selectedTemplate, selections },
      {
        onSuccess: (res) => {
          setPreviewSummary(
            res.status === 'NO_AVATAR'
              ? `No avatar yet — ${res.summary}`
              : `Avatar preview ready — ${res.summary}`,
          );
        },
        onError: (e) => Alert.alert('Preview failed', (e as Error).message),
      },
    );
  }

  function handleOrder() {
    if (!selectedTemplate) return Alert.alert('Pick a template');
    createO.mutate(
      {
        templateId: selectedTemplate,
        measurementProfileId: measurements[0]?.id ?? null,
        selections,
        tailorSellerId: selectedTailor,
      },
      { onError: (e) => Alert.alert('Order failed', (e as Error).message) },
    );
  }

  function handleReorder(orderId: string) {
    reorder.mutate(orderId, {
      onSuccess: () => Alert.alert('Reordered', 'New draft with the same selections — one tap.'),
      onError: (e) => Alert.alert('Reorder failed', (e as Error).message),
    });
  }

  return (
    <ClosetScreen
      title="Fit & Customization Vault"
      subtitle={`Region ${preferredFitRegion} · pick neckline, sleeve & pattern. Preview on avatar. Reorder in one tap.`}
    >
      <ScrollView>
        <Text style={styles.section}>Measurements (from avatar bodyMeta + manual)</Text>
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Bust cm"
            placeholderTextColor={textMuted}
            keyboardType="decimal-pad"
            value={bust}
            onChangeText={setBust}
          />
          <TextInput
            style={styles.input}
            placeholder="Waist cm"
            placeholderTextColor={textMuted}
            keyboardType="decimal-pad"
            value={waist}
            onChangeText={setWaist}
          />
          <Button
            label={createM.isPending ? 'Saving…' : 'Save measurements'}
            block
            disabled={createM.isPending}
            onPress={handleSaveMeasurements}
          />
        </View>
        {measurements.map((m) => (
          <View key={m.id} style={styles.card}>
            <Text style={styles.title}>
              {m.region} · {m.unit}
            </Text>
            <Text style={styles.muted}>{JSON.stringify(m.points)}</Text>
          </View>
        ))}
        {measurements.length === 0 ? <Text style={styles.muted}>No measurements yet.</Text> : null}

        <Text style={[styles.section, { marginTop: space4 }]}>India launch pack — Blouse & Kurti</Text>
        {templates.map((t) => (
          <View key={t.id} style={[styles.card, selectedTemplate === t.id ? styles.cardActive : null]}>
            <Text style={styles.title}>
              {t.garmentType} · {t.name}
            </Text>
            <Button
              label={selectedTemplate === t.id ? 'Selected' : 'Select'}
              size="sm"
              variant={selectedTemplate === t.id ? 'primary' : 'secondary'}
              onPress={() => setSelectedTemplate(t.id)}
            />
          </View>
        ))}

        {selectedTemplate && groups.length > 0 ? (
          <View style={styles.form}>
            <Text style={styles.section}>Customize (preview assets)</Text>
            {groups.map(({ key, group }) => (
              <View key={key} style={styles.pickerBlock}>
                <Text style={styles.title}>{group.label}</Text>
                <View style={styles.chipRow}>
                  {group.options.map((opt) => {
                    const active = selections[key] === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        style={[styles.chip, active ? styles.chipActive : null]}
                        onPress={() => setSelections((s) => ({ ...s, [key]: opt.value }))}
                        accessibilityRole="button"
                        accessibilityLabel={`${group.label} ${opt.label}`}
                      >
                        <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{opt.label}</Text>
                        <Text style={styles.chipPreview}>{opt.preview ?? opt.imageKey}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
            <Text style={styles.muted}>{selectionSummary(selections)}</Text>
            {previewSummary ? <Text style={styles.previewNote}>{previewSummary}</Text> : null}
            <Button
              label={previewMut.isPending ? 'Previewing…' : 'Preview on avatar'}
              block
              variant="secondary"
              disabled={previewMut.isPending}
              onPress={handlePreview}
            />
            <Button
              label={createO.isPending ? 'Ordering…' : 'Order tailoring'}
              block
              disabled={createO.isPending}
              onPress={handleOrder}
            />
          </View>
        ) : null}

        <Text style={[styles.section, { marginTop: space4 }]}>Tailor marketplace</Text>
        {tailors.map((t) => (
          <View key={t.id} style={[styles.card, selectedTailor === t.id ? styles.cardActive : null]}>
            <Text style={styles.title}>{t.shopName}</Text>
            <Text style={styles.muted}>
              {t.ratingAvg != null ? `${t.ratingAvg}★ · ${t.reviewCount} reviews` : 'New tailor'}
            </Text>
            <Button
              label={selectedTailor === t.id ? 'Assigned' : 'Choose tailor'}
              size="sm"
              variant={selectedTailor === t.id ? 'primary' : 'secondary'}
              onPress={() => setSelectedTailor(t.id)}
            />
          </View>
        ))}
        {tailors.length === 0 ? <Text style={styles.muted}>Loading tailors…</Text> : null}

        <Text style={[styles.section, { marginTop: space4 }]}>Tailoring orders (state machine)</Text>
        {orders.map((o) => (
          <View key={o.id} style={styles.card}>
            <Text style={styles.title}>
              {o.id.slice(0, 8)} · {o.state}
            </Text>
            <Text style={styles.muted}>
              Template {o.templateId}
              {o.tailorSellerId ? ` · tailor ${o.tailorSellerId.slice(0, 8)}` : ''}
            </Text>
            <Button
              label={reorder.isPending ? 'Reordering…' : 'Reorder one-tap'}
              size="sm"
              variant="secondary"
              disabled={reorder.isPending}
              onPress={() => handleReorder(o.id)}
            />
          </View>
        ))}
        {orders.length === 0 ? <Text style={styles.muted}>No orders yet.</Text> : null}
      </ScrollView>
    </ClosetScreen>
  );
}

const styles = StyleSheet.create({
  section: { color: text, fontFamily: fontSans, fontSize: fsBody, fontWeight: '700', marginBottom: space4 },
  form: { gap: space4, marginBottom: space4 },
  input: {
    backgroundColor: bg,
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  card: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    padding: space4,
    marginBottom: space4,
  },
  cardActive: { borderColor: '#6aa6ff' },
  title: { color: text, fontFamily: fontSans, fontSize: fsBody, fontWeight: '600' },
  muted: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption },
  pickerBlock: { gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: border,
    borderRadius: radiusMd,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: bg,
    maxWidth: '48%',
  },
  chipActive: { borderColor: '#6aa6ff', backgroundColor: surface },
  chipText: { color: text, fontFamily: fontSans, fontSize: fsCaption, fontWeight: '600' },
  chipTextActive: { color: '#6aa6ff' },
  chipPreview: { color: textMuted, fontFamily: fontSans, fontSize: 10, marginTop: 2 },
  previewNote: { color: text, fontFamily: fontSans, fontSize: fsCaption, fontWeight: '600' },
});

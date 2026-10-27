import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/src/components/ui';
import { ClosetScreen } from '@/src/components/ClosetScreen';
import { useRecipients, useCreateRecipient, useRecipientIdeas, useCreateGiftOrder } from '@/src/hooks/closet/useCloset';
import { CLOSET_OFF_SUBTITLE, closetAlertText } from '@/src/lib/closetScreenState';
import { FEATURE_CLOSET } from '@/src/lib/features';
import { bg, border, radiusMd, fontSans, fontSansSemiBold, fsBody, fsCaption, text, textMuted, surface, space4 } from '@/src/theme/tokens';

const RELATIONSHIPS = [
  { value: 'FAMILY', label: 'Family' },
  { value: 'FRIEND', label: 'Friend' },
  { value: 'PARTNER', label: 'Partner' },
  { value: 'COLLEAGUE', label: 'Colleague' },
  { value: 'OTHER', label: 'Other' },
] as const;

function relationshipLabel(value: string) {
  return RELATIONSHIPS.find((r) => r.value === value)?.label ?? value.toLowerCase();
}

export default function RecipientsScreen() {
  const { data, isLoading } = useRecipients();
  const create = useCreateRecipient();
  const gift = useCreateGiftOrder();
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('FRIEND');
  const [taste, setTaste] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const ideas = useRecipientIdeas(selected ?? '');

  if (!FEATURE_CLOSET) return <ClosetScreen title="Gifts" subtitle={CLOSET_OFF_SUBTITLE} />;

  const recipients = data?.recipients ?? [];

  function handleCreate() {
    if (!name.trim()) return Alert.alert('Name required');
    create.mutate({ name: name.trim(), relationship, profile: { tasteTags: taste.split(',').map(s=>s.trim()).filter(Boolean) } }, { onSuccess: ()=> { setName(''); setTaste(''); }, onError: (e)=>Alert.alert('Failed', closetAlertText(e)) });
  }

  return (
    <ClosetScreen title="Gift Intelligence" subtitle="Know what to buy anyone — taste, sizes, every occasion.">
      <View style={styles.form}>
        <TextInput style={styles.input} placeholder="Recipient name" placeholderTextColor={textMuted} value={name} onChangeText={setName} />
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Relationship">
          {RELATIONSHIPS.map((r) => (
            <Button
              key={r.value}
              label={r.label}
              size="sm"
              variant={relationship === r.value ? 'primary' : 'ghost'}
              accessibilityRole="radio"
              accessibilityState={{ selected: relationship === r.value }}
              onPress={() => setRelationship(r.value)}
            />
          ))}
        </View>
        <TextInput style={styles.input} placeholder="What they like, e.g. saree, kurta, floral" placeholderTextColor={textMuted} value={taste} onChangeText={setTaste} />
        <Button label={create.isPending ? 'Saving…' : 'Add recipient'} block disabled={create.isPending} onPress={handleCreate} />
      </View>
      <View style={{ marginTop: space4 }}>
        {isLoading ? <Text style={styles.muted}>Loading…</Text> : null}
        {recipients.map(r=> (
          <View key={r.id} style={styles.card}>
            <Text style={styles.title}>{r.name} · {relationshipLabel(r.relationship)}</Text>
            {r.profile?.tasteTags?.length ? <Text style={styles.muted}>{r.profile.tasteTags.join(', ')}</Text> : null}
            {r.daysUntil != null && r.nextOccasionLabel ? (
              <Text style={styles.countdown}>
                {r.nextOccasionLabel} in {r.daysUntil} day{r.daysUntil === 1 ? '' : 's'}
              </Text>
            ) : null}
            <View style={styles.row}>
              <Button label={selected===r.id ? 'Selected' : 'Show ideas'} size="sm" variant={selected===r.id?'primary':'secondary'} onPress={()=>setSelected(r.id)} />
            </View>
            {selected===r.id && ideas.data ? (
              <View style={{ marginTop: space4 }}>
                {ideas.data.ideas.map(it=> (
                  <View key={it.id} style={styles.idea}>
                    <Text style={styles.title}>{it.title}</Text>
                    <Text style={styles.muted}>{it.category} · {it.reason}{it.affiliateUrl ? ' · we may earn a commission' : ''}</Text>
                    <Button label="Gift this" size="sm" variant="ghost" onPress={()=>gift.mutate({ recipientId: r.id, listingId: it.id }, { onError: (e)=>Alert.alert('Gift failed', closetAlertText(e)) })} />
                  </View>
                ))}
                {ideas.data.ideas.length===0 ? <Text style={styles.muted}>No ideas yet</Text> : null}
              </View>
            ) : null}
          </View>
        ))}
        {!isLoading && recipients.length===0 ? <Text style={styles.muted}>No recipients yet. Add one.</Text> : null}
      </View>
    </ClosetScreen>
  );
}
const styles = StyleSheet.create({
  form:{ gap: space4 },
  chips:{ flexDirection:'row', flexWrap:'wrap', gap: 8 },
  input:{ backgroundColor: bg, borderColor: border, borderRadius: radiusMd, borderWidth:1, color:text, fontFamily:fontSans, fontSize:fsBody, paddingHorizontal:12, paddingVertical:10 },
  card:{ backgroundColor:surface, borderColor:border, borderRadius:radiusMd, borderWidth:1, padding:space4, marginBottom:space4 },
  title:{ color:text, fontFamily: fontSansSemiBold, fontSize:fsBody },
  muted:{ color:textMuted, fontFamily:fontSans, fontSize:fsCaption },
  countdown:{ color:text, fontFamily: fontSansSemiBold, fontSize:fsCaption, marginTop:4 },
  row:{ flexDirection:'row', gap:space4, marginTop:space4 },
  idea:{ borderTopColor:border, borderTopWidth:1, marginTop:space4, paddingTop:space4, gap:4 },
});

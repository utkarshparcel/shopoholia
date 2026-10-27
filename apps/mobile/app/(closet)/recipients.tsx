import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/src/components/ui';
import { ClosetScreen } from '@/src/components/ClosetScreen';
import { useRecipients, useCreateRecipient, useRecipientIdeas, useCreateGiftOrder } from '@/src/hooks/closet/useCloset';
import { FEATURE_CLOSET } from '@/src/lib/features';
import { bg, border, radiusMd, fontSans, fsBody, fsCaption, text, textMuted, surface, space4 } from '@/src/theme/tokens';

export default function RecipientsScreen() {
  const { data, isLoading } = useRecipients();
  const create = useCreateRecipient();
  const gift = useCreateGiftOrder();
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('FRIEND');
  const [taste, setTaste] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const ideas = useRecipientIdeas(selected ?? '');

  if (!FEATURE_CLOSET) return <ClosetScreen title="Gifts" subtitle="Enable EXPO_PUBLIC_FEATURE_CLOSET=1 to view gift engine." />;

  const recipients = data?.recipients ?? [];

  function handleCreate() {
    if (!name.trim()) return Alert.alert('Name required');
    create.mutate({ name: name.trim(), relationship, profile: { tasteTags: taste.split(',').map(s=>s.trim()).filter(Boolean) } }, { onSuccess: ()=> { setName(''); setTaste(''); }, onError: (e)=>Alert.alert('Failed', (e as Error).message) });
  }

  return (
    <ClosetScreen title="Gift Intelligence" subtitle="Know what to buy anyone — taste, sizes, every occasion.">
      <View style={styles.form}>
        <TextInput style={styles.input} placeholder="Recipient name" placeholderTextColor={textMuted} value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="Relationship (FAMILY/FRIEND/PARTNER/COLLEAGUE/OTHER)" placeholderTextColor={textMuted} value={relationship} onChangeText={setRelationship} />
        <TextInput style={styles.input} placeholder="Taste tags csv e.g. saree, kurta, floral" placeholderTextColor={textMuted} value={taste} onChangeText={setTaste} />
        <Button label={create.isPending ? 'Saving…' : 'Add recipient'} block disabled={create.isPending} onPress={handleCreate} />
      </View>
      <ScrollView style={{ marginTop: space4 }}>
        {isLoading ? <Text style={styles.muted}>Loading…</Text> : null}
        {recipients.map(r=> (
          <View key={r.id} style={styles.card}>
            <Text style={styles.title}>{r.name} · {r.relationship}</Text>
            <Text style={styles.muted}>{r.profile?.tasteTags?.join(', ') || 'no taste tags'} · {r.region}</Text>
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
                    <Text style={styles.muted}>{it.category} · {it.reason} {it.affiliateUrl ? '· affiliate' : ''}</Text>
                    <Button label="Gift this" size="sm" variant="ghost" onPress={()=>gift.mutate({ recipientId: r.id, listingId: it.id }, { onError: (e)=>Alert.alert('Gift failed', (e as Error).message) })} />
                  </View>
                ))}
                {ideas.data.ideas.length===0 ? <Text style={styles.muted}>No ideas yet</Text> : null}
              </View>
            ) : null}
          </View>
        ))}
        {!isLoading && recipients.length===0 ? <Text style={styles.muted}>No recipients yet. Add one.</Text> : null}
      </ScrollView>
    </ClosetScreen>
  );
}
const styles = StyleSheet.create({
  form:{ gap: space4 },
  input:{ backgroundColor: bg, borderColor: border, borderRadius: radiusMd, borderWidth:1, color:text, fontFamily:fontSans, fontSize:fsBody, paddingHorizontal:12, paddingVertical:10 },
  card:{ backgroundColor:surface, borderColor:border, borderRadius:radiusMd, borderWidth:1, padding:space4, marginBottom:space4 },
  title:{ color:text, fontFamily:fontSans, fontSize:fsBody, fontWeight:'600' },
  muted:{ color:textMuted, fontFamily:fontSans, fontSize:fsCaption },
  countdown:{ color:text, fontFamily:fontSans, fontSize:fsCaption, fontWeight:'600', marginTop:4 },
  row:{ flexDirection:'row', gap:space4, marginTop:space4 },
  idea:{ borderTopColor:border, borderTopWidth:1, marginTop:space4, paddingTop:space4, gap:4 },
});

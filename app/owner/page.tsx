// The truck's page: everything customers see on Home and Account that is not the
// menu. Story, how to reach him, socials, delivery apps, and the reviews he picks
// from his Google page. Empty fields simply don't show.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Body, Button, Card, H2, Muted, Row, Screen } from '@/components/ui';
import { getTruckStatus, setTruckPage } from '@/lib/api';
import { theme } from '@/lib/theme';
import type { Testimonial, TruckStatus } from '@/lib/types';

const LINKS: { key: keyof TruckStatus; label: string; hint: string }[] = [
  { key: 'instagram', label: 'Instagram', hint: 'https://www.instagram.com/…' },
  { key: 'tiktok', label: 'TikTok', hint: 'https://www.tiktok.com/@…' },
  { key: 'facebook', label: 'Facebook', hint: 'https://www.facebook.com/…' },
  { key: 'doordash', label: 'DoorDash store', hint: 'https://www.doordash.com/store/…' },
  { key: 'ubereats', label: 'Uber Eats store', hint: 'https://www.ubereats.com/store/…' },
  { key: 'grubhub', label: 'Grubhub store', hint: 'https://www.grubhub.com/restaurant/…' },
];

export default function TruckPage() {
  const [s, setS] = useState<TruckStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Testimonial>({ name: '', quote: '', stars: 5 });

  useFocusEffect(useCallback(() => {
    getTruckStatus().then((t) => setS({ ...t, testimonials: (t.testimonials ?? []).filter((x) => !x.sample) })).catch(() => {});
  }, []));

  if (!s) return <Screen />;
  const set = (patch: Partial<TruckStatus>) => setS({ ...s, ...patch });
  const bad = (v?: string | null) => !!v && !/^https?:\/\/\S+$/.test(v.trim());

  async function save() {
    if (LINKS.some((l) => bad(s![l.key] as string))) { Alert.alert('Check the links', 'Every link has to start with https://'); return; }
    setBusy(true);
    try { await setTruckPage(s!); Alert.alert('Saved', 'Customers see it next time they open the app.'); }
    catch (e: any) { Alert.alert('Could not save', e.message ?? String(e)); }
    finally { setBusy(false); }
  }

  function addReview() {
    if (!draft.name.trim() || !draft.quote.trim()) return;
    set({ testimonials: [...(s!.testimonials ?? []), { ...draft, name: draft.name.trim(), quote: draft.quote.trim() }] });
    setDraft({ name: '', quote: '', stars: 5 });
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 8 }}>
          <H2>Our story</H2>
          <Muted>A few lines about you and the truck. Shows on the Account tab.</Muted>
          <TextInput value={s.story ?? ''} onChangeText={(v) => set({ story: v })} multiline placeholder="How Buns & Patties started…" style={[st.input, { minHeight: 110, textAlignVertical: 'top' }]} />
        </Card>

        <Card style={{ gap: 8 }}>
          <H2>How customers reach you</H2>
          <Field label="Phone" value={s.phone} onChange={(v) => set({ phone: v })} hint="(713) 555-0100" keyboard="phone-pad" />
          <Field label="Email" value={s.email} onChange={(v) => set({ email: v })} hint="hello@bunsandpattieshtx.com" keyboard="email-address" />
        </Card>

        <Card style={{ gap: 8 }}>
          <H2>Links</H2>
          <Muted>Leave one empty and it doesn't show.</Muted>
          {LINKS.map((l) => (
            <View key={l.key} style={{ gap: 2 }}>
              <Field label={l.label} value={s[l.key] as string} onChange={(v) => set({ [l.key]: v } as Partial<TruckStatus>)} hint={l.hint} keyboard="url" />
              {bad(s[l.key] as string) && <Muted style={{ color: theme.colors.danger }}>Has to start with https://</Muted>}
            </View>
          ))}
        </Card>

        <Card style={{ gap: 10 }}>
          <H2>Reviews on the home screen</H2>
          <Muted>Copy your favourite Google reviews here. First name only. Three to five read best.</Muted>
          {(s.testimonials ?? []).map((r, i) => (
            <Row key={i} style={{ gap: 10, alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Body>“{r.quote}”</Body>
                <Muted>{'★'.repeat(r.stars)} {r.name}</Muted>
              </View>
              <Button title="Remove" variant="ghost" onPress={() => set({ testimonials: s.testimonials!.filter((_, j) => j !== i) })} style={{ paddingHorizontal: 8, paddingVertical: 4 }} />
            </Row>
          ))}
          <TextInput value={draft.quote} onChangeText={(v) => setDraft({ ...draft, quote: v })} multiline placeholder="What they said" style={[st.input, { minHeight: 70, textAlignVertical: 'top' }]} />
          <Row style={{ gap: 8 }}>
            <TextInput value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder="First name" style={[st.input, { flex: 1 }]} />
            <Row>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setDraft({ ...draft, stars: n })} hitSlop={4}>
                  <Text style={[st.star, n <= draft.stars && { color: theme.colors.accent }]}>★</Text>
                </Pressable>
              ))}
            </Row>
          </Row>
          <Button title="Add review" variant="secondary" disabled={!draft.name.trim() || !draft.quote.trim()} onPress={addReview} />
        </Card>

        <Button title={busy ? 'Saving…' : 'Save'} disabled={busy} onPress={save} />
      </ScrollView>
    </Screen>
  );
}

function Field({ label, value, onChange, hint, keyboard }: { label: string; value?: string | null; onChange: (v: string) => void; hint: string; keyboard?: 'url' | 'phone-pad' | 'email-address' }) {
  return (
    <View style={{ gap: 4 }}>
      <Muted>{label}</Muted>
      <TextInput value={value ?? ''} onChangeText={onChange} placeholder={hint} autoCapitalize="none" autoCorrect={false} keyboardType={keyboard} style={st.input} />
    </View>
  );
}

const st = StyleSheet.create({
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, padding: 11, fontSize: 16 },
  star: { fontSize: 26, color: theme.colors.border, paddingHorizontal: 1 },
});

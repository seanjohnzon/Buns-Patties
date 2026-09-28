// The owner's giveaway tool. Make an offer, say what someone has to do, cap it,
// and watch what it cost. The free drink is just the first one of these.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Body, Button, Card, H2, Muted, Row, Screen, money } from '@/components/ui';
import { getMenu, getOwnerCampaigns, saveCampaign, setCampaignActive, type CampaignStats } from '@/lib/api';
import { worstCase } from '@/lib/campaigns';
import { theme } from '@/lib/theme';
import type { MenuItem } from '@/lib/types';

export default function OwnerCampaigns() {
  const [rows, setRows] = useState<CampaignStats[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [open, setOpen] = useState(false);

  // new campaign
  const [title, setTitle] = useState('');
  const [what, setWhat] = useState('');          // what they have to do
  const [url, setUrl] = useState('');
  const [itemId, setItemId] = useState('');
  const [cap, setCap] = useState('100');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getOwnerCampaigns().then(setRows).catch(() => {});
    getMenu().then(({ items }) => setItems(items));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const chosen = items.find((i) => i.id === itemId);
  const capNum = parseInt(cap, 10);
  const exposure = chosen && Number.isFinite(capNum) ? worstCase(capNum, chosen.price) : null;
  const ready = title.trim() && what.trim() && /^https?:\/\/\S+$/.test(url.trim()) && chosen && capNum > 0;

  async function create() {
    setBusy(true);
    try {
      const id = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) + '_' + Date.now().toString(36).slice(-4);
      await saveCampaign({
        id, title: title.trim(), blurb: '',
        actions: [{ id: 'do_it', label: what.trim(), url: url.trim() }],
        rewardItemId: itemId, maxClaims: capNum, endsAt: null, active: true,
      });
      setTitle(''); setWhat(''); setUrl(''); setItemId(''); setCap('100'); setOpen(false);
      load();
    } catch (e: any) { Alert.alert('Could not save that', e.message ?? String(e)); }
    finally { setBusy(false); }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Muted>
          Nobody can check whether someone really liked or followed — no app is allowed to.
          So an offer is kept safe by its shape: one per person, a hard cap, and you can stop it any time.
        </Muted>

        {rows.map((c) => (
          <Card key={c.id} style={{ gap: 8, opacity: c.active ? 1 : 0.6 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <H2>{c.title}</H2>
                <Muted>
                  {c.claimsCount} unlocked · {c.usedCount} actually used
                  {c.maxClaims !== null ? ` · ${Math.max(0, c.maxClaims - c.claimsCount)} left` : ' · no cap'}
                </Muted>
              </View>
              <Switch value={c.active} onValueChange={(v) => setCampaignActive(c.id, v).then(load)} trackColor={{ true: theme.colors.accent }} />
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body>Cost so far</Body>
              <Body style={{ fontWeight: '700' }}>{money(c.cost)}</Body>
            </Row>
          </Card>
        ))}

        {!open ? (
          <Button title="New offer" onPress={() => setOpen(true)} />
        ) : (
          <Card style={{ gap: 10 }}>
            <H2>New offer</H2>

            <View style={{ gap: 4 }}>
              <Muted>What it's called</Muted>
              <TextInput value={title} onChangeText={setTitle} placeholder="Free fries" style={st.input} />
            </View>

            <View style={{ gap: 4 }}>
              <Muted>What they have to do</Muted>
              <TextInput value={what} onChangeText={setWhat} placeholder="Like and share our post" style={st.input} />
            </View>

            <View style={{ gap: 4 }}>
              <Muted>Link to send them to</Muted>
              <TextInput value={url} onChangeText={setUrl} placeholder="https://instagram.com/p/..." autoCapitalize="none" style={st.input} />
              {!!url && !/^https?:\/\/\S+$/.test(url.trim()) && <Muted style={{ color: theme.colors.danger }}>That doesn't look like a link.</Muted>}
            </View>

            <View style={{ gap: 4 }}>
              <Muted>What they get</Muted>
              <Row style={{ flexWrap: 'wrap', gap: 6 }}>
                {items.filter((i) => i.price <= 6).map((i) => (
                  <Button key={i.id} title={`${i.name} ${money(i.price)}`} variant={itemId === i.id ? 'primary' : 'secondary'}
                          onPress={() => setItemId(i.id)} style={{ paddingHorizontal: 12, paddingVertical: 8 }} />
                ))}
              </Row>
            </View>

            <View style={{ gap: 4 }}>
              <Muted>How many, at most</Muted>
              <TextInput value={cap} onChangeText={setCap} keyboardType="number-pad" style={st.input} />
            </View>

            <Card style={{ backgroundColor: theme.colors.bgMuted, borderWidth: 0, gap: 2 }}>
              <Muted>Most this can ever cost you</Muted>
              <Body style={{ fontSize: 24, fontWeight: '800' }}>{exposure === null ? '—' : money(exposure)}</Body>
              <Muted>It stops on its own at {cap || '—'}. You can switch it off sooner.</Muted>
            </Card>

            <Button title={busy ? 'Saving…' : 'Start it'} disabled={!ready || busy} onPress={create} />
            <Button title="Cancel" variant="ghost" onPress={() => setOpen(false)} />
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, padding: 11, fontSize: 16 },
});

// The owner's campaign builder. Two shapes, both built from buttons:
//   "Do this, get that" — pick what they do (follow, tag, open a link), pick what
//     they get, cap it. The free drink is one of these.
//   "Stamp card" — a minimum order, and what 5 or 10 (or any number) of stamps buy.
// Every campaign shows what it has cost so far, and can be switched off in one tap.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Body, Button, Card, H2, Muted, Pill, Row, Screen, money } from '@/components/ui';
import { getMenu, getOwnerCampaigns, getTruckStatus, saveCampaign, setCampaignActive, type CampaignStats } from '@/lib/api';
import { ACTION_PRESETS, worstCase, type ActionKind, type StampTier } from '@/lib/campaigns';
import { theme } from '@/lib/theme';
import type { MenuItem, TruckStatus } from '@/lib/types';

type Kind = 'action' | 'stamps';
const ENDS = [{ label: 'No end', days: 0 }, { label: '1 week', days: 7 }, { label: '2 weeks', days: 14 }, { label: '1 month', days: 30 }];
const isUrl = (v: string) => /^https?:\/\/\S+$/.test(v.trim());

export default function OwnerCampaigns() {
  const [rows, setRows] = useState<CampaignStats[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [truck, setTruck] = useState<TruckStatus | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);

  const load = useCallback(() => {
    getOwnerCampaigns().then(setRows).catch(() => {});
    getMenu().then(({ items }) => setItems(items)).catch(() => {});
    getTruckStatus().then(setTruck).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {rows.map((c) => (
          <Card key={c.id} style={{ gap: 8, opacity: c.active ? 1 : 0.55 }}>
            <Row style={{ justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={st.kind}>{c.kind === 'stamps' ? 'STAMP CARD' : 'DO THIS, GET THAT'}</Text>
                <H2>{c.title}</H2>
                <Muted>
                  {c.kind === 'stamps'
                    ? `${c.usedCount} rewards taken`
                    : `${c.claimsCount} unlocked · ${c.usedCount} used${c.maxClaims !== null ? ` · ${Math.max(0, c.maxClaims - c.claimsCount)} left` : ''}`}
                  {c.endsAt ? ` · ends ${new Date(c.endsAt).toLocaleDateString()}` : ''}
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

        {!kind ? (
          <Card style={{ gap: 10 }}>
            <H2>New campaign</H2>
            <Button title="Do this, get that" onPress={() => setKind('action')} />
            <Muted>Follow us, tag us, check out a post — and get something free. One per customer.</Muted>
            <Button title="Stamp card" variant="secondary" onPress={() => setKind('stamps')} />
            <Muted>Every order over a minimum is a stamp. You choose what the stamps buy.</Muted>
          </Card>
        ) : kind === 'action' ? (
          <ActionForm items={items} truck={truck} onDone={() => { setKind(null); load(); }} />
        ) : (
          <StampForm items={items} onDone={() => { setKind(null); load(); }} />
        )}

        <Muted style={{ marginTop: 8 }}>
          No app is allowed to check whether someone really followed or tagged you. So every
          offer is kept safe by its shape: one per customer, a cap, and an off switch.
        </Muted>
      </ScrollView>
    </Screen>
  );
}

// ---------- do this, get that ----------

function ActionForm({ items, truck, onDone }: { items: MenuItem[]; truck: TruckStatus | null; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<Partial<Record<ActionKind, string>>>({});
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [cap, setCap] = useState('100');
  const [ends, setEnds] = useState(0);
  const [busy, setBusy] = useState(false);

  // A preset starts with the link the owner already saved on his truck page.
  function togglePreset(k: ActionKind) {
    setPicked((p) => {
      if (k in p) { const { [k]: _, ...rest } = p; return rest; }
      const url = k === 'follow_instagram' || k === 'tag_us' ? truck?.instagram ?? '' : k === 'follow_tiktok' ? truck?.tiktok ?? '' : '';
      return { ...p, [k]: url };
    });
  }

  const actions = (Object.entries(picked) as [ActionKind, string][]).map(([k, url]) => ({
    id: k, label: ACTION_PRESETS.find((p) => p.kind === k)!.label, url: url.trim(),
  }));
  const capNum = parseInt(cap, 10);
  const priciest = Math.max(0, ...items.filter((i) => itemIds.includes(i.id)).map((i) => i.price));
  const exposure = itemIds.length && capNum > 0 ? worstCase(capNum, priciest) : null;
  const ready = title.trim() && actions.length > 0 && actions.every((a) => isUrl(a.url)) && itemIds.length > 0 && capNum > 0;

  async function save() {
    setBusy(true);
    try {
      await saveCampaign({
        id: slug(title), kind: 'action', title: title.trim(), blurb: '', finePrint: 'One per customer.',
        actions, rewardItemIds: itemIds, cover: {}, minOrder: null, tiers: [],
        maxClaims: capNum, endsAt: ends ? new Date(Date.now() + ends * 864e5).toISOString() : null, active: true,
      });
      onDone();
    } catch (e: any) { Alert.alert('Could not save that', e.message ?? String(e)); }
    finally { setBusy(false); }
  }

  return (
    <Card style={{ gap: 12 }}>
      <H2>Do this, get that</H2>
      <Labelled label="What it's called">
        <TextInput value={title} onChangeText={setTitle} placeholder="Free fries for a TikTok follow" style={st.input} />
      </Labelled>

      <Labelled label="What they do (any one of these unlocks it)">
        <Row style={st.wrap}>
          {ACTION_PRESETS.map((p) => <Pill key={p.kind} label={p.label} active={p.kind in picked} onPress={() => togglePreset(p.kind)} />)}
        </Row>
        {actions.map((a) => (
          <View key={a.id} style={{ gap: 2 }}>
            <Muted>Link for “{a.label}”</Muted>
            <TextInput value={picked[a.id as ActionKind]} onChangeText={(v) => setPicked((p) => ({ ...p, [a.id]: v }))}
              placeholder={ACTION_PRESETS.find((p) => p.kind === a.id)!.hint} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={st.input} />
            {!!a.url && !isUrl(a.url) && <Muted style={{ color: theme.colors.danger }}>Has to start with https://</Muted>}
          </View>
        ))}
      </Labelled>

      <Labelled label="What they get (they pick one)">
        <Row style={st.wrap}>
          {items.map((i) => (
            <Pill key={i.id} label={`${i.name} ${money(i.price)}`} active={itemIds.includes(i.id)}
              onPress={() => setItemIds((ids) => (ids.includes(i.id) ? ids.filter((x) => x !== i.id) : [...ids, i.id]))} />
          ))}
        </Row>
      </Labelled>

      <Labelled label="How many, at most">
        <TextInput value={cap} onChangeText={setCap} keyboardType="number-pad" style={st.input} />
      </Labelled>

      <Labelled label="Ends">
        <Row style={st.wrap}>{ENDS.map((e) => <Pill key={e.days} label={e.label} active={ends === e.days} onPress={() => setEnds(e.days)} />)}</Row>
      </Labelled>

      <Card style={st.exposure}>
        <Muted>Most this can ever cost you</Muted>
        <Body style={{ fontSize: 24, fontWeight: '800' }}>{exposure === null ? '—' : money(exposure)}</Body>
        <Muted>It stops by itself at {cap || '—'}. One per customer.</Muted>
      </Card>

      <Button title={busy ? 'Saving…' : 'Start it'} disabled={!ready || busy} onPress={save} />
      <Button title="Cancel" variant="ghost" onPress={onDone} />
    </Card>
  );
}

// ---------- stamp card ----------

type TierDraft = { stamps: string; label: string; itemIds: string[]; double: boolean };

function StampForm({ items, onDone }: { items: MenuItem[]; onDone: () => void }) {
  const [title, setTitle] = useState('Stamp card');
  const [min, setMin] = useState('15');
  const [tiers, setTiers] = useState<TierDraft[]>([
    { stamps: '5', label: 'Free fries', itemIds: [], double: false },
    { stamps: '10', label: 'Free burger', itemIds: [], double: true },
  ]);
  const [busy, setBusy] = useState(false);

  const patch = (i: number, p: Partial<TierDraft>) => setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, ...p } : t)));
  const minNum = parseFloat(min);
  const clean: StampTier[] = tiers
    .filter((t) => parseInt(t.stamps, 10) > 0 && t.itemIds.length && t.label.trim())
    .map((t) => ({ stamps: parseInt(t.stamps, 10), label: t.label.trim(), itemIds: t.itemIds, cover: (t.double ? { patty: 2 } : {}) as Record<string, number> }))
    .sort((a, b) => a.stamps - b.stamps);
  const ready = title.trim() && minNum >= 0 && clean.length > 0 && clean.length === tiers.length;

  async function save() {
    setBusy(true);
    try {
      await saveCampaign({
        id: slug(title), kind: 'stamps', title: title.trim(), blurb: 'Every order is a stamp',
        finePrint: `Orders of $${minNum} or more before tax earn a stamp. One stamp per order. Taking a reward uses its stamps.`,
        actions: [], rewardItemIds: [], cover: {}, minOrder: minNum, tiers: clean,
        maxClaims: null, endsAt: null, active: true,
      });
      onDone();
    } catch (e: any) { Alert.alert('Could not save that', e.message ?? String(e)); }
    finally { setBusy(false); }
  }

  return (
    <Card style={{ gap: 12 }}>
      <H2>Stamp card</H2>
      <Labelled label="What it's called">
        <TextInput value={title} onChangeText={setTitle} style={st.input} />
      </Labelled>
      <Labelled label="Smallest order that earns a stamp ($, before tax)">
        <TextInput value={min} onChangeText={setMin} keyboardType="decimal-pad" style={st.input} />
      </Labelled>

      {tiers.map((t, i) => (
        <Card key={i} style={{ gap: 8, backgroundColor: theme.colors.bgMuted, borderWidth: 0 }}>
          <Row style={{ gap: 8 }}>
            <TextInput value={t.stamps} onChangeText={(v) => patch(i, { stamps: v })} keyboardType="number-pad" style={[st.input, { width: 64, textAlign: 'center' }]} />
            <Muted>stamps =</Muted>
            <TextInput value={t.label} onChangeText={(v) => patch(i, { label: v })} placeholder="Free fries" style={[st.input, { flex: 1 }]} />
          </Row>
          <Muted>They pick one of:</Muted>
          <Row style={st.wrap}>
            {items.map((m) => (
              <Pill key={m.id} label={m.name} active={t.itemIds.includes(m.id)}
                onPress={() => patch(i, { itemIds: t.itemIds.includes(m.id) ? t.itemIds.filter((x) => x !== m.id) : [...t.itemIds, m.id] })} />
            ))}
          </Row>
          {items.some((m) => t.itemIds.includes(m.id) && m.modifierGroups.some((g) => g.id === 'patty')) && (
            <Row style={{ justifyContent: 'space-between' }}>
              <Muted style={{ flex: 1 }}>Double patty included free (a triple pays the difference)</Muted>
              <Switch value={t.double} onValueChange={(v) => patch(i, { double: v })} trackColor={{ true: theme.colors.accent }} />
            </Row>
          )}
          <Button title="Remove this reward" variant="ghost" onPress={() => setTiers((ts) => ts.filter((_, j) => j !== i))} />
        </Card>
      ))}
      <Button title="Add a reward" variant="secondary" onPress={() => setTiers((ts) => [...ts, { stamps: '', label: '', itemIds: [], double: false }])} />
      <Muted>Paid extras on a free item are always charged.</Muted>

      <Button title={busy ? 'Saving…' : 'Start it'} disabled={!ready || busy} onPress={save} />
      <Button title="Cancel" variant="ghost" onPress={onDone} />
    </Card>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={{ gap: 6 }}><Muted>{label}</Muted>{children}</View>;
}

function slug(title: string) {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) + '_' + Date.now().toString(36).slice(-4);
}

const st = StyleSheet.create({
  kind: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: theme.colors.textMuted },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, padding: 11, fontSize: 16, backgroundColor: theme.colors.bg },
  wrap: { flexWrap: 'wrap', gap: 6 },
  exposure: { backgroundColor: theme.colors.bgMuted, borderWidth: 0, gap: 2 },
});

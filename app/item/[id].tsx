// Item detail. A burger opens already built the way the board describes it: its
// sauce and cheese are picked, what comes on it is listed, and the only thing
// the customer does is add. With ?claim=<campaign>&tier=<stamps> it is a reward:
// the item is on the house and only real extras are charged.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ItemImage } from '@/components/ItemImage';
import { Body, Button, H1, H2, Muted, Row, Screen, Stepper, money } from '@/components/ui';
import { getCampaigns, getItem } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { bump, countOf, groupHint, groupMax, initialChoice, missing, tap, trimToLimits, type Choice } from '@/lib/modifiers';
import { rewardUnitPrice } from '@/lib/pricing';
import { theme } from '@/lib/theme';
import type { Claim, MenuItem, ModifierGroup } from '@/lib/types';

export default function ItemDetail() {
  const { id, claim: claimId, tier } = useLocalSearchParams<{ id: string; claim?: string; tier?: string }>();
  const [item, setItem] = useState<MenuItem | undefined>();
  const [choice, setChoice] = useState<Choice>({});
  const [claim, setClaim] = useState<Claim | null>(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const add = useCart((s) => s.add);
  const router = useRouter();

  useEffect(() => {
    getItem(id).then((i) => { setItem(i); if (i) setChoice(initialChoice(i)); });
  }, [id]);

  // A reward: find out what it covers, from the campaign itself.
  useEffect(() => {
    if (!claimId) return;
    getCampaigns().then((cs) => {
      const c = cs.find((x) => x.id === claimId);
      if (!c) return;
      const t = c.kind === 'stamps' ? c.tiers.find((x) => x.stamps === Number(tier)) : undefined;
      setClaim({ campaign: c.id, tier: t?.stamps, cover: t ? t.cover ?? {} : c.cover });
    }).catch(() => {});
  }, [claimId, tier]);

  const all = useMemo(() => Object.values(choice).flat(), [choice]);
  if (!item) return <Screen />;

  const listUnit = item.price + all.reduce((s, o) => s + o.priceDelta, 0);
  const unit = claim ? rewardUnitPrice(item, all, claim.cover) : listUnit;
  const need = missing(item, choice);

  function onTap(g: ModifierGroup, optId: string) {
    const opt = g.options.find((o) => o.id === optId)!;
    setChoice((c) => trimToLimits(item!, tap(g, opt, c)));
  }

  const addLabel = need.length
    ? `Pick ${need[0].name.toLowerCase()}`
    : claim
      ? (unit > 0 ? `Add · ${money(unit)} for extras` : 'Add it — on us')
      : `Add ${qty} · ${money(unit * qty)}`;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }}>
        <ItemImage uri={item.imageUrl} style={s.hero} logoScale={0.5} />
        <View style={{ padding: 16, gap: 18 }}>
          <View style={{ gap: 4 }}>
            {claim && <Text style={s.onUs}>ON US</Text>}
            <H1>{item.name}</H1>
            {!!item.description && <Muted>{item.description}</Muted>}
            <Body style={{ fontWeight: '700', marginTop: 4 }}>
              {claim ? <Text style={{ textDecorationLine: 'line-through', color: theme.colors.textMuted }}>{money(item.price)}</Text> : money(item.price)}
              {claim ? '  Free' : ''}
            </Body>
          </View>

          {!!item.includes?.length && (
            <View style={{ gap: 8 }}>
              <H2>Comes with</H2>
              <Row style={{ flexWrap: 'wrap', gap: 6 }}>
                {item.includes.map((x) => <View key={x} style={s.chip}><Text style={s.chipTxt}>{x}</Text></View>)}
              </Row>
            </View>
          )}

          {item.modifierGroups.map((g) => (
            <View key={g.id} style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <H2>{g.name}</H2>
                <Muted style={need.includes(g) ? { color: theme.colors.heat, fontWeight: '700' } : undefined}>{groupHint(g, choice)}</Muted>
              </Row>
              {g.counted
                ? g.options.map((o) => {
                    const n = countOf(choice, g.id, o.id);
                    return (
                      <Row key={o.id} style={s.opt}>
                        <Body style={{ flex: 1 }}>{o.name}</Body>
                        {n > 0 && <Muted>{money(o.priceDelta * n)}</Muted>}
                        <Stepper qty={n} onChange={(q) => setChoice((c) => bump(g, o, q > n ? 1 : -1, c))} />
                      </Row>
                    );
                  })
                : g.options.map((o) => {
                    const on = choice[g.id]?.some((x) => x.id === o.id);
                    const radio = groupMax(g, choice) === 1;
                    // "comes with it" only means something for the burger's own sauce and cheese.
                    const isDefault = (g.id === 'sauce' || g.id === 'cheese') && item.defaults?.[g.id]?.includes(o.id);
                    return (
                      <Pressable key={o.id} onPress={() => onTap(g, o.id)} style={s.opt}>
                        <View style={[radio ? s.radio : s.check, on && s.on]}>{on && <Text style={s.tick}>✓</Text>}</View>
                        <Body style={{ flex: 1 }}>
                          {o.name}{isDefault ? <Text style={s.std}>  comes with it</Text> : null}
                        </Body>
                        {o.priceDelta !== 0 && <Muted>+{money(o.priceDelta)}</Muted>}
                      </Pressable>
                    );
                  })}
            </View>
          ))}

          <View style={{ gap: 8 }}>
            <H2>Anything else?</H2>
            <TextInput value={note} onChangeText={setNote} placeholder="e.g. well done, cut in half" style={s.input} />
          </View>

          {claim && (
            <Muted style={s.fine}>
              The {item.name} is on us{claim.cover && Object.keys(claim.cover).length ? ', and so is a double patty' : ''}. Paid extras are still charged.
            </Muted>
          )}
        </View>
      </ScrollView>

      <View style={s.footer}>
        {!claim && <Stepper qty={qty} onChange={(q) => setQty(Math.max(1, q))} />}
        <Button
          title={addLabel}
          disabled={need.length > 0}
          style={{ flex: 1 }}
          onPress={() => {
            add(
              claim ? { ...item, name: `${item.name} (on us)` } : item,
              all, claim ? 1 : qty, note || undefined, claim ?? undefined,
            );
            router.back();
          }}
        />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { width: '100%', height: 240 },
  onUs: { color: theme.colors.heat, fontWeight: '800', fontSize: 11, letterSpacing: 1.5 },
  chip: { backgroundColor: theme.colors.bgMuted, borderRadius: theme.radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipTxt: { fontSize: 14, color: theme.colors.text },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  std: { fontSize: 12, color: theme.colors.textMuted },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  tick: { color: '#fff', fontSize: 13, fontWeight: '800' },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 12, fontSize: 16 },
  fine: { fontSize: 12 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 32, flexDirection: 'row', gap: 16, alignItems: 'center', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: theme.colors.border },
});

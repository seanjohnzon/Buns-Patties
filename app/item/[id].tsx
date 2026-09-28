// Item detail — modifier groups (single / multi select), qty, note, "Add to order".
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ItemImage } from '@/components/ItemImage';
import { Body, Button, H1, H2, Muted, Row, Screen, Stepper, money } from '@/components/ui';
import { getItem } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { theme } from '@/lib/theme';
import type { MenuItem, ModifierOption } from '@/lib/types';

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<MenuItem | undefined>();
  const [chosen, setChosen] = useState<Record<string, ModifierOption[]>>({});
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const add = useCart((s) => s.add);
  const router = useRouter();

  useEffect(() => { getItem(id).then(setItem); }, [id]);

  const all = useMemo(() => Object.values(chosen).flat(), [chosen]);
  const unit = (item?.price ?? 0) + all.reduce((s, o) => s + o.priceDelta, 0);
  const missingRequired = item?.modifierGroups.some((g) => g.required && (chosen[g.id]?.length ?? 0) < g.min);

  function toggle(groupId: string, opt: ModifierOption, max: number) {
    setChosen((c) => {
      const cur = c[groupId] ?? [];
      const has = cur.some((o) => o.id === opt.id);
      if (max === 1) return { ...c, [groupId]: has ? [] : [opt] };
      if (has) return { ...c, [groupId]: cur.filter((o) => o.id !== opt.id) };
      if (cur.length >= max) return c;
      return { ...c, [groupId]: [...cur, opt] };
    });
  }

  if (!item) return <Screen />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <ItemImage uri={item.imageUrl} style={s.hero} logoScale={0.5} />
        <View style={{ padding: 16, gap: 16 }}>
          <View>
            <H1>{item.name}</H1>
            {!!item.description && <Muted style={{ marginTop: 4 }}>{item.description}</Muted>}
            <Body style={{ fontWeight: '600', marginTop: 6 }}>{money(item.price)}</Body>
          </View>

          {item.modifierGroups.map((g) => (
            <View key={g.id} style={{ gap: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <H2>{g.name}</H2>
                <Muted>{g.required ? 'Required' : g.max === 1 ? 'Optional' : `Pick up to ${g.max}`}</Muted>
              </Row>
              {g.options.map((o) => {
                const on = chosen[g.id]?.some((x) => x.id === o.id);
                return (
                  <Pressable key={o.id} onPress={() => toggle(g.id, o, g.max)} style={s.opt}>
                    <View style={[g.max === 1 ? s.radio : s.check, on && s.on]}>{on && <Text style={s.tick}>✓</Text>}</View>
                    <Body style={{ flex: 1 }}>{o.name}</Body>
                    {o.priceDelta !== 0 && <Muted>+{money(o.priceDelta)}</Muted>}
                  </Pressable>
                );
              })}
            </View>
          ))}

          <View style={{ gap: 8 }}>
            <H2>Special instructions</H2>
            <TextInput value={note} onChangeText={setNote} placeholder="e.g. sauce on the side" style={s.input} />
          </View>
        </View>
      </ScrollView>

      <View style={s.footer}>
        <Stepper qty={qty} onChange={(q) => setQty(Math.max(1, q))} />
        <Button
          title={`Add ${qty} · ${money(unit * qty)}`}
          disabled={missingRequired}
          style={{ flex: 1 }}
          onPress={() => { add(item, all, qty, note || undefined); router.back(); }}
        />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { width: '100%', height: 240 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  tick: { color: '#fff', fontSize: 13, fontWeight: '800' },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 12, fontSize: 16 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 32, flexDirection: 'row', gap: 16, alignItems: 'center', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: theme.colors.border },
});

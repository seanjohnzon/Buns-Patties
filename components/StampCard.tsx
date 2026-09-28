// The stamp card. Ten boxes, the rewards marked on the boxes that earn them,
// and a button the moment one is ready. The $15 rule lives in the small print,
// where every coffee-shop card keeps it.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, Muted, Row } from '@/components/ui';
import { getCampaigns, getMyStamps, getProfile } from '@/lib/api';
import { cardSize, nextTier, readyTiers, type Campaign, type StampTier } from '@/lib/campaigns';
import { theme } from '@/lib/theme';

export function StampCards({ compact }: { compact?: boolean }) {
  const [cards, setCards] = useState<Campaign[]>([]);
  const [stamps, setStamps] = useState<Record<string, number>>({});
  const [signedIn, setSignedIn] = useState(false);
  const router = useRouter();

  useFocusEffect(useCallback(() => {
    getCampaigns().then((cs) => setCards(cs.filter((c) => c.kind === 'stamps' && c.tiers.length))).catch(() => {});
    getMyStamps().then(setStamps).catch(() => {});
    getProfile().then((p) => setSignedIn(!!p)).catch(() => {});
  }, []));

  function take(c: Campaign, t: StampTier) {
    if (t.itemIds.length === 1) {
      router.push({ pathname: '/item/[id]', params: { id: t.itemIds[0], claim: c.id, tier: String(t.stamps) } });
    } else {
      router.push({ pathname: '/reward', params: { campaign: c.id, tier: String(t.stamps) } });
    }
  }

  return (
    <>
      {cards.map((c) => {
        const have = stamps[c.id] ?? 0;
        const size = cardSize(c);
        const ready = readyTiers(c, have);
        const next = nextTier(c, have);
        return (
          <Card key={c.id} style={st.card}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Text style={st.kicker}>STAMP CARD</Text>
                <Text style={st.title}>{c.tiers.map((t) => `${t.stamps} = ${t.label.replace(/^Free /, 'free ')}`).join(' · ')}</Text>
              </View>
              <Text style={st.count}>{have}<Text style={st.of}>/{size}</Text></Text>
            </Row>

            <View style={st.grid}>
              {Array.from({ length: size }, (_, i) => {
                const n = i + 1;
                const tier = c.tiers.find((t) => t.stamps === n);
                const on = n <= have;
                return (
                  <View key={n} style={[st.box, on && st.boxOn, tier && !on && st.boxTier]}>
                    {on ? <Text style={st.mark}>🍔</Text>
                      : tier ? <Text style={st.tierTxt}>{tier.label.replace(/^Free /, '').toUpperCase()}</Text>
                      : <Text style={st.num}>{n}</Text>}
                  </View>
                );
              })}
            </View>

            {!signedIn ? (
              <Button title="Sign in to start your card" style={st.btn} onPress={() => router.push('/auth')} />
            ) : ready.length ? (
              <View style={{ gap: 8 }}>
                {ready.map((t) => (
                  <Button key={t.stamps} title={`Take your ${t.label.toLowerCase()}`} style={st.btn} onPress={() => take(c, t)} />
                ))}
                {ready.length === 1 && next && <Muted style={st.muted}>Or save up: {next.ordersToGo} more for the {next.tier.label.toLowerCase()}.</Muted>}
              </View>
            ) : next ? (
              <Muted style={st.muted}>{next.ordersToGo} more {next.ordersToGo === 1 ? 'order' : 'orders'} to your {next.tier.label.toLowerCase()}.</Muted>
            ) : null}

            {!compact && !!c.finePrint && <Text style={st.fine}>{c.finePrint}</Text>}
            {compact && !!c.minOrder && <Text style={st.fine}>Orders of ${c.minOrder}+ count.</Text>}
          </Card>
        );
      })}
    </>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent, gap: 14, padding: 18 },
  kicker: { color: theme.colors.brand, fontWeight: '800', fontSize: 11, letterSpacing: 1.5, opacity: 0.7 },
  title: { color: theme.colors.brand, fontWeight: '800', fontSize: 18, marginTop: 2 },
  count: { color: theme.colors.brand, fontWeight: '900', fontSize: 30, letterSpacing: -1 },
  of: { fontSize: 16, fontWeight: '700', opacity: 0.6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  box: { width: '17.6%', aspectRatio: 1, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(17,17,17,0.25)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand, borderStyle: 'solid' },
  boxTier: { borderColor: theme.colors.brand, borderStyle: 'solid', backgroundColor: 'rgba(255,255,255,0.35)' },
  mark: { fontSize: 22 },
  num: { color: 'rgba(17,17,17,0.45)', fontWeight: '700' },
  tierTxt: { color: theme.colors.brand, fontWeight: '900', fontSize: 9, letterSpacing: 0.5 },
  btn: { backgroundColor: theme.colors.brand },
  muted: { color: theme.colors.brand, opacity: 0.75 },
  fine: { color: theme.colors.brand, opacity: 0.6, fontSize: 11, lineHeight: 15 },
});

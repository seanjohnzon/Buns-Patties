// Owner's home. Modelled on Toast Now: today's takings first and large, a
// comparison to the same point last week, then what actually sold.
import { Link } from 'expo-router';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, H2, Muted, Row, Screen, money } from '@/components/ui';
import { getOwnerRewards, getOwnerToday, getProductMix } from '@/lib/api';
import { mixShare, rewardsLiability, summariseToday, type MixRow, type RewardsRaw, type TodayRaw } from '@/lib/reporting';
import { theme } from '@/lib/theme';

export default function OwnerHome() {
  const [today, setToday] = useState<TodayRaw | null>(null);
  const [mix, setMix] = useState<MixRow[]>([]);
  const [rewards, setRewards] = useState<RewardsRaw | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    Promise.all([getOwnerToday(), getProductMix(7), getOwnerRewards()])
      .then(([t, m, r]) => { setToday(t); setMix(m); setRewards(r); })
      .catch(() => {})
      .finally(() => setBusy(false));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!today) return <Screen style={{ alignItems: 'center', justifyContent: 'center' }}><Muted>Loading…</Muted></Screen>;

  const s = summariseToday(today);
  const rows = mixShare(mix).slice(0, 6);
  const best = rows[0];

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={theme.colors.text} />}>

        <View style={st.headline}>
          <Text style={st.hLabel}>TAKINGS TODAY</Text>
          <Text style={st.hBig}>{money(s.net)}</Text>
          <Delta value={s.netChange} noun="than this time last week" />
        </View>

        <Row style={{ gap: 12 }}>
          <Stat label="Orders" value={String(s.orders)} sub={<Delta value={s.ordersChange} noun="vs last week" small />} />
          <Stat label="Average order" value={money(s.avgTicket)} />
        </Row>

        <Row style={{ gap: 12 }}>
          <Stat label="Tips" value={money(s.tips)} sub={<Muted>Staff, not takings</Muted>} />
          <Stat label="Given away" value={money(s.discount)} sub={<Muted>Points redeemed</Muted>} />
        </Row>

        <Card style={{ gap: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <H2>What's selling</H2>
            <Muted>Last 7 days</Muted>
          </Row>
          {rows.length === 0 && <Muted>Nothing sold yet.</Muted>}
          {rows.map((r) => (
            <View key={r.menuItemId} style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Body style={{ flex: 1 }} numberOfLines={1}>{r.name}</Body>
                <Body style={{ fontWeight: '700' }}>{r.qty}</Body>
                <Muted style={{ width: 72, textAlign: 'right' }}>{money(r.revenue)}</Muted>
              </Row>
              <View style={st.track}><View style={[st.fill, { width: `${Math.max(2, r.share * 100)}%` }]} /></View>
            </View>
          ))}
          {best && <Muted>Prep {best.name} first — it outsells everything else.</Muted>}
        </Card>

        {rewards && (
          <Card style={{ gap: 8 }}>
            <H2>Rewards</H2>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body>Points people are holding</Body>
              <Body style={{ fontWeight: '700' }}>{rewards.pointsOutstanding.toLocaleString()}</Body>
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body>What that could cost you</Body>
              <Body style={{ fontWeight: '700', color: theme.colors.danger }}>{money(rewardsLiability(rewards.pointsOutstanding))}</Body>
            </Row>
            <Muted>Not all of it gets claimed, but treat it as money owed.</Muted>
            <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <Muted>{rewards.members} members · {rewards.newThisWeek} new this week</Muted>
            </Row>
          </Card>
        )}

        <View style={{ gap: 8 }}>
          <Link href="/staff/status" asChild><Button title="Open / close the truck" variant="secondary" /></Link>
          <Link href="/owner/menu" asChild><Button title="Mark items sold out" variant="secondary" /></Link>
          <Link href="/owner/campaigns" asChild><Button title="Offers and giveaways" variant="secondary" /></Link>
          <Link href="/owner/feedback" asChild><Button title="What people are saying" variant="secondary" /></Link>
          <Link href="/owner/people" asChild><Button title="Who can use the staff screens" variant="secondary" /></Link>
          <Link href="/staff" asChild><Button title="Kitchen board" variant="secondary" /></Link>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <Card style={{ flex: 1, gap: 2 }}>
      <Text style={st.sLabel}>{label.toUpperCase()}</Text>
      <Text style={st.sValue}>{value}</Text>
      {sub}
    </Card>
  );
}

function Delta({ value, noun, small }: { value: number | null; noun: string; small?: boolean }) {
  if (value === null) return <Muted>No figure to compare with</Muted>;
  const up = value >= 0;
  return (
    <Text style={[small ? st.dSmall : st.dBig, { color: up ? theme.colors.success : theme.colors.danger }]}>
      {up ? '▲' : '▼'} {Math.abs(value)}% {noun}
    </Text>
  );
}

const st = StyleSheet.create({
  headline: { backgroundColor: theme.colors.brand, borderRadius: theme.radius.lg, padding: 18, gap: 4 },
  hLabel: { color: 'rgba(255,255,255,0.65)', fontWeight: '700', fontSize: 11, letterSpacing: 1 },
  hBig: { color: '#fff', fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  dBig: { fontWeight: '700', fontSize: 14 },
  dSmall: { fontWeight: '700', fontSize: 12 },
  sLabel: { fontSize: 10, letterSpacing: 1, fontWeight: '700', color: theme.colors.textMuted },
  sValue: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  track: { height: 6, backgroundColor: theme.colors.bgMuted, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: theme.colors.accent },
});

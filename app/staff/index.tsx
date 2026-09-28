// Kitchen board — the truck's side. Live orders, tap to advance status.
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Body, Button, Card, H2, Muted, Row, Screen, money } from '@/components/ui';
import { getStuckOrders, releaseStuckOrder, staffListOrders, staffSetStatus, type StuckOrder } from '@/lib/api';
import { supabase, hasSupabase } from '@/lib/supabase';
import { ticket } from '@/lib/modifiers';
import { theme } from '@/lib/theme';
import type { Order } from '@/lib/types';

const NEXT: Partial<Record<Order['status'], { to: Order['status']; label: string }>> = {
  received: { to: 'preparing', label: 'Start cooking' },
  preparing: { to: 'ready', label: 'Mark ready' },
  ready: { to: 'completed', label: 'Picked up' },
};

export default function Kitchen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stuck, setStuck] = useState<StuckOrder[]>([]);
  const refresh = () => {
    staffListOrders().then(setOrders);
    getStuckOrders().then(setStuck).catch(() => {});
  };

  useEffect(() => {
    refresh();
    if (!hasSupabase) return;
    const ch = supabase.channel('kitchen').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refresh).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <Screen>
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: 40 }}>{hasSupabase ? 'No open orders.' : 'Demo mode — connect Supabase.'}</Muted>}
        ListHeaderComponent={<>
          <Link href="/staff/soldout" asChild><Button title="Ran out of something? Mark it sold out" variant="secondary" /></Link>
          {stuck.length > 0 ? (
          <Card style={{ gap: 8, borderColor: theme.colors.danger, borderWidth: 2, marginBottom: 4 }}>
            <H2>Paid, but not on the board</H2>
            <Muted>
              {stuck.length === 1 ? 'Someone paid' : `${stuck.length} people paid`} and the order never opened.
              Check the payment went through in Stripe, then put it on the board.
            </Muted>
            {stuck.map((s) => (
              <Row key={s.id} style={{ justifyContent: 'space-between', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '600' }}>{money(s.total)}</Body>
                  <Muted>{new Date(s.createdAt).toLocaleTimeString()} · {s.paymentIntent?.slice(-8)}</Muted>
                </View>
                <Button title="Put on the board" onPress={() => releaseStuckOrder(s.id).then(refresh)} />
              </Row>
            ))}
          </Card>
        ) : null}</>}
        renderItem={({ item: o }) => {
          const n = NEXT[o.status];
          return (
            <Card style={{ gap: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <H2>{o.pickupName || '#' + o.id.slice(0, 6).toUpperCase()}</H2>
                <Muted>{o.pickupAt ? new Date(o.pickupAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'ASAP'} · {o.status}</Muted>
              </Row>
              {o.lines.map((l, i) => {
                const tk = ticket(l.mods);
                return (
                  <View key={i} style={{ gap: 2 }}>
                    <Body style={{ fontWeight: '700' }}>{l.qty}× {l.name.replace(/ \(on us\)$/, '')}{l.free ? '  · FREE' : ''}</Body>
                    {tk.no.length > 0 && <Body style={{ color: theme.colors.heat, fontWeight: '800' }}>{tk.no.join(' · ').toUpperCase()}</Body>}
                    {!!tk.rest && <Muted>{tk.rest}</Muted>}
                    {!!l.note && <Body style={{ fontStyle: 'italic' }}>“{l.note}”</Body>}
                  </View>
                );
              })}
              {n && <Button title={n.label} onPress={() => staffSetStatus(o.id, n.to).then(refresh)} />}
            </Card>
          );
        }}
      />
    </Screen>
  );
}

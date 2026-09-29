// Order status — live via Supabase realtime; kitchen taps advance it.
import { Link, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { OrderStatusStepper } from '@/components/OrderStatusStepper';
import { Body, Button, Card, H1, Muted, Row, Screen, money } from '@/components/ui';
import { getOrder, subscribeOrder } from '@/lib/api';
import { summarise } from '@/lib/modifiers';
import type { Order } from '@/lib/types';

export default function OrderStatus() {
  const { id, paid } = useLocalSearchParams<{ id: string; paid?: string }>();
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    getOrder(id).then(setOrder);
    return subscribeOrder(id, setOrder);
  }, [id]);
  // Coming back from the Square page: look again straight away.
  useFocusEffect(useCallback(() => { getOrder(id).then((o) => o && setOrder(o)); }, [id]));

  // Back from the hosted payment page. The webhook usually lands first, but if
  // it has not yet, say something true rather than showing a stale status.
  const justPaid = paid === '1' && order?.status === 'pending_payment';
  const unpaid = !justPaid && order?.status === 'pending_payment';
  const cancelled = order?.status === 'cancelled';

  function finishPaying() {
    if (!order?.checkoutUrl) return;
    if (Platform.OS === 'web') Linking.openURL(order.checkoutUrl);
    else WebBrowser.openBrowserAsync(order.checkoutUrl, { dismissButtonStyle: 'close' });
  }

  if (!order) return <Screen style={{ alignItems: 'center', justifyContent: 'center' }}><Muted>Loading…</Muted></Screen>;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <View>
          <H1>{justPaid ? 'Payment received' : unpaid ? 'Waiting for your payment' : cancelled ? 'This order was cancelled' : order.status === 'ready' ? 'Ready — come grab it!' : order.status === 'completed' ? 'Enjoy!' : 'We got your order'}</H1>
          {justPaid && <Muted>Just confirming with the kitchen — this updates by itself.</Muted>}
          {unpaid && <Muted>The kitchen starts as soon as it is paid. This screen updates by itself.</Muted>}
          {cancelled && <Muted>Nothing was charged, or it has been refunded. Any reward it used is back on your card.</Muted>}
          <Muted>
            {order.pickupName ? `Ask for ${order.pickupName}` : `Order #${order.id.slice(0, 6).toUpperCase()}`}
            {' · '}{order.pickupAt ? `Pickup ${new Date(order.pickupAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'ASAP'}
          </Muted>
        </View>
        {unpaid && !!order.checkoutUrl && <Button title={`Pay ${money(order.total)}`} onPress={finishPaying} />}
        {!unpaid && !cancelled && <Card><OrderStatusStepper status={order.status} /></Card>}
        {(order.status === 'ready' || order.status === 'completed') && (
          <Link href={{ pathname: '/feedback', params: { orderId: order.id } }} asChild>
            <Button title="How was it?" variant="secondary" />
          </Link>
        )}
        <Card style={{ gap: 8 }}>
          {order.lines.map((l, i) => (
            <Row key={i} style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Body>{l.qty}× {l.name}</Body>
                {l.mods.length > 0 && <Muted>{summarise(l.mods.map((name) => ({ id: name, name, priceDelta: 0 })))}</Muted>}
                {!!l.note && <Muted>“{l.note}”</Muted>}
              </View>
              <Body>{money(l.price * l.qty)}</Body>
            </Row>
          ))}
          <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <Body style={{ fontWeight: '700' }}>Total</Body>
            <Body style={{ fontWeight: '700' }}>{money(order.total)}</Body>
          </Row>
          {order.stampsEarned > 0 && <Muted>+1 stamp on your card.</Muted>}
        </Card>
      </ScrollView>
    </Screen>
  );
}

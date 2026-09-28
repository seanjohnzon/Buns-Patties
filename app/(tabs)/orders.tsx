import { Link } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Body, Card, Muted, Row, Screen, money } from '@/components/ui';
import { getMyOrders } from '@/lib/api';
import type { Order } from '@/lib/types';

const LABEL: Record<Order['status'], string> = { pending_payment: 'Not paid', received: 'Received', preparing: 'Cooking', ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled' };

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  useFocusEffect(useCallback(() => { getMyOrders().then(setOrders).catch(() => {}); }, []));

  return (
    <Screen>
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: 40 }}>No orders yet.</Muted>}
        renderItem={({ item: o }) => (
          <Link href={{ pathname: '/order/[id]', params: { id: o.id } }} asChild>
            <Pressable>
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View>
                    <Body style={{ fontWeight: '600' }}>{o.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}</Body>
                    <Muted>{new Date(o.createdAt).toLocaleString()} · +{o.pointsEarned} pts</Muted>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Body style={{ fontWeight: '600' }}>{money(o.total)}</Body>
                    <Muted>{LABEL[o.status]}</Muted>
                  </View>
                </Row>
              </Card>
            </Pressable>
          </Link>
        )}
      />
    </Screen>
  );
}

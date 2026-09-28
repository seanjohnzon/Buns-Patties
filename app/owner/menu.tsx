// Run out of something mid-service? Turn it off here and it stops appearing
// in the app immediately. Staff can do this too — it is not an owner decision.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert, FlatList, Switch, View } from 'react-native';
import { Body, Muted, Row, Screen, money } from '@/components/ui';
import { getMenu, isSoldOut, setSoldOut } from '@/lib/api';
import { theme } from '@/lib/theme';
import type { MenuItem } from '@/lib/types';

export default function OwnerMenu() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [off, setOff] = useState<Record<string, boolean>>({});

  useFocusEffect(useCallback(() => {
    getMenu().then(({ items }) => {
      setItems(items);
      // Show what is actually off right now, not whatever was tapped last time.
      setOff(Object.fromEntries(items.map((i) => [i.id, isSoldOut(i)])));
    });
  }, []));

  async function toggle(id: string, soldOut: boolean) {
    setOff((o) => ({ ...o, [id]: soldOut }));
    try { await setSoldOut(id, soldOut); }
    catch (e: any) { setOff((o) => ({ ...o, [id]: !soldOut })); Alert.alert('Could not save', e.message ?? String(e)); }
  }

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={<Muted style={{ paddingBottom: 12 }}>Turning something off hides it from customers straight away. It comes back on its own tomorrow.</Muted>}
        renderItem={({ item }) => {
          const soldOut = off[item.id] ?? false;
          return (
            <Row style={{ justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '600', opacity: soldOut ? 0.5 : 1 }}>{item.name}</Body>
                <Muted>{soldOut ? 'Sold out' : money(item.price)}</Muted>
              </View>
              <Switch
                value={!soldOut}
                onValueChange={(on) => toggle(item.id, !on)}
                trackColor={{ true: theme.colors.accent }}
              />
            </Row>
          );
        }}
      />
    </Screen>
  );
}

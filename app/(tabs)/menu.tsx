// Menu — category pills on top, item rows below (reference app screen 3).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { CartBar } from '@/components/CartBar';
import { LoadFailed } from '@/components/LoadFailed';
import { MenuItemRow } from '@/components/MenuItemRow';
import { H2, Pill, Screen } from '@/components/ui';
import { getMenu, isSoldOut } from '@/lib/api';
import type { Category, MenuItem } from '@/lib/types';

export default function Menu() {
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [active, setActive] = useState<string>('all');
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    // Anything staff have run out of simply is not on the menu today.
    getMenu()
      .then(({ categories, items }) => { setCats(categories); setItems(items.filter((i) => !isSoldOut(i))); })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  const shown = useMemo(() => (active === 'all' ? items : items.filter((i) => i.categoryId === active)), [items, active]);

  if (failed) return <LoadFailed what="menu" onRetry={load} />;

  return (
    <Screen>
      <View style={{ paddingVertical: 10 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          <Pill label="All" active={active === 'all'} onPress={() => setActive('all')} />
          {cats.map((c) => <Pill key={c.id} label={c.name} active={active === c.id} onPress={() => setActive(c.id)} />)}
        </ScrollView>
      </View>
      <FlatList
        data={shown}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        ListHeaderComponent={<H2 style={{ paddingTop: 6 }}>{active === 'all' ? 'Menu' : cats.find((c) => c.id === active)?.name}</H2>}
        renderItem={({ item }) => <MenuItemRow item={item} />}
      />
      <CartBar />
    </Screen>
  );
}

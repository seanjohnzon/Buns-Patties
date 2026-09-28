// Picking which item a reward pays for: which burger at 10 stamps, or which of an
// offer's items. Only the ones the reward covers.
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { MenuItemRow } from '@/components/MenuItemRow';
import { H1, Muted, Screen } from '@/components/ui';
import { getCampaigns, getMenu, isOrderable } from '@/lib/api';
import type { MenuItem } from '@/lib/types';

export default function ChooseReward() {
  const { campaign, tier } = useLocalSearchParams<{ campaign: string; tier: string }>();
  const [label, setLabel] = useState('');
  const [items, setItems] = useState<MenuItem[]>([]);

  useEffect(() => {
    Promise.all([getCampaigns(), getMenu()]).then(([cs, m]) => {
      const c = cs.find((x) => x.id === campaign);
      const t = tier ? c?.tiers.find((x) => x.stamps === Number(tier)) : undefined;
      const ids = t ? t.itemIds : c?.rewardItemIds ?? [];
      setLabel(t ? t.label : c?.title ?? '');
      setItems(m.items.filter((i) => ids.includes(i.id) && isOrderable(i)));
    }).catch(() => {});
  }, [campaign, tier]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        <H1>{label ? `Pick your ${label.toLowerCase().replace(/^free /, '')}` : ''}</H1>
        <Muted style={{ marginBottom: 8 }}>It’s on us. Paid extras are still charged.</Muted>
        {items.map((i) => (
          <MenuItemRow key={i.id} item={i} claim={campaign} tier={tier} />
        ))}
      </ScrollView>
    </Screen>
  );
}

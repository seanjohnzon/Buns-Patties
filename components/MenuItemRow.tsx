import { Link } from 'expo-router';
import { ItemImage } from './ItemImage';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/lib/theme';
import type { MenuItem } from '@/lib/types';
import { money, Muted } from './ui';

/** `claim`/`tier` open the item as a reward (see app/reward.tsx). */
export function MenuItemRow({ item, claim, tier }: { item: MenuItem; claim?: string; tier?: string }) {
  const params = claim ? { id: item.id, claim, tier: tier ?? '' } : { id: item.id };
  return (
    <Link href={{ pathname: '/item/[id]', params }} replace={!!claim} asChild>
      <Pressable style={s.row}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.name}>{item.name}</Text>
          {!!item.description && <Muted numberOfLines={2}>{item.description}</Muted>}
          <Text style={s.price}>{claim ? 'On us' : money(item.price)}</Text>
        </View>
        <View style={s.imgWrap}>
          <ItemImage uri={item.imageUrl} style={s.img} />
          <View style={s.plus}><Text style={s.plusTxt}>+</Text></View>
        </View>
      </Pressable>
    </Link>
  );
}

export function FeaturedCard({ item, badge }: { item: MenuItem | { name: string; imageUrl: string | null; price?: number }; badge?: string }) {
  return (
    <View style={s.feat}>
      <ItemImage uri={item.imageUrl} style={s.featImg} />
      {badge && <View style={s.badge}><Text style={s.badgeTxt}>{badge}</Text></View>}
      <Text style={s.featName} numberOfLines={1}>{item.name}</Text>
      {'price' in item && item.price !== undefined && <Muted>{money(item.price)}</Muted>}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  name: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  price: { fontSize: 15, fontWeight: '600', color: theme.colors.text, marginTop: 2 },
  imgWrap: { width: 88, height: 88 },
  img: { width: 88, height: 88, borderRadius: theme.radius.md },
  placeholder: { backgroundColor: theme.colors.bgMuted },
  plus: { position: 'absolute', right: -6, bottom: -6, width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.white, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  plusTxt: { fontSize: 20, fontWeight: '600', lineHeight: 22 },
  feat: { width: 140, gap: 6 },
  featImg: { width: 140, height: 110, borderRadius: theme.radius.md },
  featName: { fontWeight: '600', color: theme.colors.text },
  badge: { position: 'absolute', top: 8, left: 8, backgroundColor: theme.colors.brand, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
});

// Sticky "View order" bar — shows whenever the cart has items (like Toast / Owner apps).
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cartTotals, useCart } from '@/lib/cart';
import { theme } from '@/lib/theme';
import { money } from './ui';

export function CartBar() {
  const lines = useCart((s) => s.lines);
  if (lines.length === 0) return null;
  const t = cartTotals(lines, 0, 0);
  return (
    <View style={s.wrap}>
      <Link href="/cart" asChild>
        <Pressable style={s.bar} accessibilityLabel={`View order, ${t.count} items, ${money(t.subtotal)}`}>
          <View style={s.count}><Text style={s.countTxt}>{t.count}</Text></View>
          <Text style={s.label}>View order</Text>
          <Text style={s.label}>{money(t.subtotal)}</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, bottom: 12 },
  bar: { backgroundColor: theme.colors.brand, borderRadius: theme.radius.pill, paddingVertical: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  count: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 8, minWidth: 26, height: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countTxt: { color: '#fff', fontWeight: '700' },
  label: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

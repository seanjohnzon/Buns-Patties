import { SymbolView } from 'expo-symbols';
import { Link, Tabs } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { theme } from '@/lib/theme';
import { useCart } from '@/lib/cart';

function CartButton() {
  const count = useCart((s) => s.lines.reduce((n, l) => n + l.qty, 0));
  return (
    <Link href="/cart" asChild>
      <Pressable style={{ marginRight: 16, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <SymbolView name={{ ios: 'bag', android: 'shopping_bag', web: 'shopping_bag' }} size={24} tintColor={theme.colors.text} />
        {count > 0 && (
          <View style={{ backgroundColor: theme.colors.brand, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{count}</Text>
          </View>
        )}
      </Pressable>
    </Link>
  );
}

const icon = (ios: any, android: any) => ({ color }: { color: any }) => (
  <SymbolView name={{ ios, android, web: android }} tintColor={color} size={26} />
);

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: theme.colors.brand, headerShadowVisible: false, headerRight: () => <CartButton /> }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('house', 'home') }} />
      <Tabs.Screen name="menu" options={{ title: 'Menu', tabBarIcon: icon('fork.knife', 'restaurant') }} />
      <Tabs.Screen name="rewards" options={{ title: 'Rewards', tabBarIcon: icon('star', 'star') }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: icon('clock', 'schedule') }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('person', 'person') }} />
    </Tabs>
  );
}

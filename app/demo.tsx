// Dev-only: seeds a sample order and jumps to the cart, so the checkout screen
// can be demoed/screenshotted without tapping through the menu.
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Screen, Muted } from '@/components/ui';
import { DEMO_ALLOWED, getItem } from '@/lib/api';
import { useCart } from '@/lib/cart';

export default function Demo() {
  const router = useRouter();
  const { clear, add } = useCart();

  useEffect(() => {
    if (!DEMO_ALLOWED) { router.replace('/(tabs)/menu'); return; }
    (async () => {
      clear();
      const og = await getItem('og');
      const fries = await getItem('smash_fries');
      const drink = await getItem('can_drink');
      if (og) {
        const patty = og.modifierGroups.find((g) => g.id === 'patty')!.options[1];       // Double
        const bacon = og.modifierGroups.find((g) => g.id === 'toppings_add')!.options.find((o) => o.id === 't_bacon')!;
        add(og, [patty, bacon], 1, 'extra crispy');
      }
      if (fries) {
        const patty = fries.modifierGroups.find((g) => g.id === 'patty')!.options[0];    // Single
        const sauce = fries.modifierGroups.find((g) => g.id === 'sauce_pick')!.options.find((o) => o.id === 'sp_og')!;
        add(fries, [patty, sauce], 1);
      }
      if (drink) {
        const which = drink.modifierGroups.find((g) => g.id === 'drink_pick')!.options[0];
        add(drink, [which], 2);
      }
      router.replace('/cart');
    })();
  }, []);

  return <Screen style={{ alignItems: 'center', justifyContent: 'center' }}><Muted>Building demo order…</Muted></Screen>;
}

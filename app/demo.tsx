// Dev-only: builds a sample order and jumps to the cart, so the checkout screen
// can be shown without tapping through the menu. Each item goes in exactly as
// its page opens (lib/modifiers initialChoice), plus the picks it needs.
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Screen, Muted } from '@/components/ui';
import { DEMO_ALLOWED, getItem } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { initialChoice } from '@/lib/modifiers';
import type { MenuItem, ModifierOption } from '@/lib/types';

const pick = (item: MenuItem, groupId: string, optionId: string): ModifierOption =>
  item.modifierGroups.find((g) => g.id === groupId)!.options.find((o) => o.id === optionId)!;

export default function Demo() {
  const router = useRouter();
  const { clear, add } = useCart();

  useEffect(() => {
    if (!DEMO_ALLOWED) { router.replace('/(tabs)/menu'); return; }
    (async () => {
      clear();
      const [og, fries, drink] = await Promise.all([getItem('og'), getItem('smash_fries'), getItem('can_drink')]);
      if (og) {
        const c = initialChoice(og);
        c.patty = [pick(og, 'patty', 'p_double')];
        c.add_og = [pick(og, 'add_og', 't_bacon')];
        add(og, Object.values(c).flat(), 1, 'extra crispy');
      }
      if (fries) {
        const c = initialChoice(fries);
        c.sauce = [pick(fries, 'sauce', 's_og')];
        add(fries, Object.values(c).flat(), 1);
      }
      if (drink) add(drink, [pick(drink, 'drink_pick', 'd_coke')], 2);
      router.replace('/cart');
    })();
  }, []);

  return <Screen style={{ alignItems: 'center', justifyContent: 'center' }}><Muted>Building demo order…</Muted></Screen>;
}
